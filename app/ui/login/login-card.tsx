"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker as MediaPipeFaceLandmarker } from "@mediapipe/tasks-vision";
import {
	getCachedBrowserIdentity,
	getBrowserIdentity,
	type BrowserFingerprintStatus,
	type BrowserIdentity,
} from "@/app/lib/browser-fingerprint";
import {
	getFaceIdBrowserNotice,
	mapFaceIdErrorMessage,
} from "@/app/lib/face-id";
import { dataUrlToFile } from "@/app/lib/face-id-camera";

// ---------- Face-login tunables (single source of truth) ----------
// Minimum face bbox height as fraction of frame (user close enough).
const FACE_MIN_HEIGHT = 0.25;
// Maximum face bbox height (not clipped at edges).
const FACE_MAX_HEIGHT = 0.9;
// Bbox center must be within ±this fraction of frame center on both axes.
const FACE_CENTER_TOLERANCE = 0.2;
// Yaw proxy: (eye-to-nose) asymmetry; ~0.15 corresponds to roughly |yaw| > 15°.
const FACE_YAW_TOLERANCE = 0.15;
// Pitch proxy: normalized nose offset vs eye/mouth midline.
const FACE_PITCH_TOLERANCE = 0.18;
// Bbox center drift (fraction of frame) must stay under this across the stability window.
const FACE_STABILITY_MAX_DRIFT = 0.02;
// Face must remain gated-ok and still for this long before we auto-submit.
const FACE_STABILITY_MS = 300;
// Minimum wait after a failed attempt before trying again.
const FAIL_BACKOFF_MS = 500;
// Give up after this many consecutive failures.
const MAX_ATTEMPTS = 5;
// Or after this long of continuous failure — whichever hits first.
const GIVEUP_AFTER_MS = 10_000;
// Cap MediaPipe analysis cadence to avoid redundant work per frame.
const ANALYSIS_INTERVAL_MS = 90;

const MEDIAPIPE_WASM_ROOT =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const FACE_LANDMARKER_MODEL_ASSET =
	"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Error codes that cannot be resolved by retrying the same face — short-circuit to giveup.
const TERMINAL_ERROR_CODES = new Set([
	"ADMIN_NOT_FOUND",
	"BROWSER_NOT_LINKED",
	"BROWSER_NOT_OTP_VERIFIED",
	"FACE_PROFILE_NOT_FOUND",
	"FACEID_DISABLED",
	"INVALID_EMAIL",
]);

type Point2D = {
	x: number;
	y: number;
};

// MediaPipe face-landmark indices used for pose estimation.
const LM = {
	chin: 152,
	forehead: 10,
	leftEyeOuter: 33,
	mouthBottom: 14,
	mouthTop: 13,
	noseTip: 1,
	rightEyeOuter: 263,
} as const;

type GateReason =
	| "ok"
	| "no-face"
	| "multi-face"
	| "too-far"
	| "too-close"
	| "off-center-x"
	| "off-center-y"
	| "yaw"
	| "pitch"
	| "unstable"
	| "missing-landmarks";

const GATE_MESSAGE: Record<GateReason, string> = {
	"missing-landmarks": "Looking for you…",
	"multi-face": "Only one face in frame, please.",
	"no-face": "Looking for you…",
	"off-center-x": "Center your face.",
	"off-center-y": "Center your face.",
	ok: "Hold still…",
	pitch: "Face the camera straight on.",
	"too-close": "Move back a little.",
	"too-far": "Come a little closer.",
	unstable: "Hold still…",
	yaw: "Face the camera straight on.",
};

type LandmarkEval = {
	bbox: { cx: number; cy: number; h: number; w: number };
	gate: GateReason;
	pitch: number;
	yaw: number;
};

/**
 * Run all per-frame quality gates from a single FaceLandmarker result. Pure, no
 * side-effects; caller decides what to do with the outcome.
 *
 * Yaw proxy: ratio of horizontal distances from each outer eye to the nose tip;
 * equal distances ⇒ frontal. Pitch proxy: vertical offset of nose from the
 * midpoint of the eye line and mouth line, normalized by eye-mouth span.
 */
function evaluateLandmarks(landmarks: Point2D[]): LandmarkEval | null {
	const nose = landmarks[LM.noseTip];
	const lEye = landmarks[LM.leftEyeOuter];
	const rEye = landmarks[LM.rightEyeOuter];
	const mTop = landmarks[LM.mouthTop];
	const mBot = landmarks[LM.mouthBottom];
	const forehead = landmarks[LM.forehead];
	const chin = landmarks[LM.chin];
	if (!nose || !lEye || !rEye || !mTop || !mBot || !forehead || !chin) {
		return null;
	}

	let minX = 1;
	let maxX = 0;
	let minY = 1;
	let maxY = 0;
	for (const p of landmarks) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	const w = maxX - minX;
	const h = maxY - minY;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const bbox = { cx, cy, h, w };

	// Yaw: asymmetry between left-eye→nose and right-eye→nose horizontal distances.
	const dLeft = Math.abs(nose.x - lEye.x);
	const dRight = Math.abs(rEye.x - nose.x);
	const denom = Math.max(dLeft + dRight, 1e-6);
	const yaw = (dRight - dLeft) / denom; // 0 = frontal, ±1 = full profile

	// Pitch: nose vertical offset vs the midpoint of eye-line and mouth-line.
	const eyeY = (lEye.y + rEye.y) / 2;
	const mouthY = (mTop.y + mBot.y) / 2;
	const midY = (eyeY + mouthY) / 2;
	const spanY = Math.max(mouthY - eyeY, 1e-6);
	const pitch = (nose.y - midY) / spanY;

	let gate: GateReason = "ok";
	if (h < FACE_MIN_HEIGHT) gate = "too-far";
	else if (h > FACE_MAX_HEIGHT) gate = "too-close";
	// Centering gates removed: no guide oval on login, any position is fine
	// as long as the face is large enough and roughly frontal.
	else if (Math.abs(yaw) > FACE_YAW_TOLERANCE) gate = "yaw";
	else if (Math.abs(pitch) > FACE_PITCH_TOLERANCE) gate = "pitch";

	return { bbox, gate, pitch, yaw };
}

/**
 * Capture the current `<video>` frame at its native resolution as a JPEG data
 * URL. No crop, no downscale — backend YuNet re-detects anyway.
 */
function captureFullVideoFrame(
	video: HTMLVideoElement,
	canvas: HTMLCanvasElement,
): string | null {
	const w = video.videoWidth;
	const h = video.videoHeight;
	if (!w || !h) return null;
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.drawImage(video, 0, 0, w, h);
	return canvas.toDataURL("image/jpeg", 0.95);
}

type Tab = "student" | "admin";

export type FaceLoginSubmitResult =
	| { nextPage?: string; ok: true; userName?: string }
	| {
			errorCode?: string;
			message?: string;
			ok: false;
			terminal?: boolean;
	  };

type OverlayPhase =
	| "booting" // setting up camera + model
	| "searching" // no face / gate failing
	| "holding" // gates ok, running stability window
	| "verifying" // request in flight
	| "success"
	| "giveup"
	| "fatal"; // camera/model unavailable

type ApiError = {
	error?: string;
	errorCode?: string;
	errors?: string[];
	message?: string;
	nextPage?: string;
};

async function readApiPayload(response: Response) {
	try {
		return (await response.json()) as ApiError;
	} catch {
		return null;
	}
}

function getApiErrorMessage(payload: ApiError | null, fallback: string) {
	if (!payload) {
		return fallback;
	}

	if (payload.errorCode) {
		return mapFaceIdErrorMessage(payload.errorCode, fallback);
	}

	if (typeof payload.message === "string" && payload.message.trim()) {
		return payload.message;
	}

	if (typeof payload.error === "string" && payload.error.trim()) {
		return payload.error;
	}

	if (Array.isArray(payload.errors) && payload.errors.length > 0) {
		return payload.errors.join(", ");
	}

	return fallback;
}

function FaceIdLoginOverlay({
	email,
	onCancel,
	onSubmit,
}: {
	email: string;
	onCancel: () => void;
	onSubmit: (file: File) => Promise<FaceLoginSubmitResult>;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const landmarkerRef = useRef<MediaPipeFaceLandmarker | null>(null);
	const rafRef = useRef<number | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	// Loop-internal refs (don't trigger re-renders):
	const lastAnalysisAtRef = useRef(0); // throttle MediaPipe calls
	const inFlightRef = useRef(false); // single in-flight request guard
	const lastFailAtRef = useRef(0); // for 500ms back-off after failure
	const attemptCountRef = useRef(0);
	const firstAttemptAtRef = useRef<number | null>(null);
	const stabilityStartAtRef = useRef<number | null>(null);
	const stabilityCenterRef = useRef<{ x: number; y: number } | null>(null);
	const maxDriftRef = useRef(0);
	const phaseRef = useRef<OverlayPhase>("booting");

	// Debug-only telemetry (only rendered when debug is on).
	const telemetryRef = useRef<{
		drift: number;
		evalResult: LandmarkEval | null;
		gate: GateReason;
	}>({ drift: 0, evalResult: null, gate: "no-face" });

	const [phase, setPhase] = useState<OverlayPhase>("booting");
	const [statusMessage, setStatusMessage] = useState("Starting camera…");
	const [welcomeName, setWelcomeName] = useState<string | undefined>();
	const [fatalMessage, setFatalMessage] = useState("");
	const [debugTick, setDebugTick] = useState(0);

	const searchParams = useSearchParams();
	const debugOn = searchParams?.get("debug") === "1";

	// Keep phaseRef in sync so the rAF loop can read it without a closure refresh.
	useEffect(() => {
		phaseRef.current = phase;
	}, [phase]);

	// ---------- One-shot setup: camera + FaceLandmarker ----------
	useEffect(() => {
		let cancelled = false;

		async function boot() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						facingMode: "user",
						height: { ideal: 720 },
						width: { ideal: 1280 },
					},
				});
				if (cancelled) {
					for (const t of stream.getTracks()) t.stop();
					return;
				}
				streamRef.current = stream;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}

				const vision = await import("@mediapipe/tasks-vision");
				if (cancelled) return;
				const wasmFileset = await vision.FilesetResolver.forVisionTasks(
					MEDIAPIPE_WASM_ROOT,
				);
				if (cancelled) return;
				const landmarker = await vision.FaceLandmarker.createFromOptions(
					wasmFileset,
					{
						baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_ASSET },
						minFaceDetectionConfidence: 0.6,
						minFacePresenceConfidence: 0.6,
						minTrackingConfidence: 0.6,
						numFaces: 2, // detect up to 2 so we can reject multi-face
						outputFacialTransformationMatrixes: false,
						runningMode: "VIDEO",
					},
				);
				if (cancelled) {
					landmarker.close();
					return;
				}
				landmarkerRef.current = landmarker;
				setPhase("searching");
				setStatusMessage("Looking for you…");
			} catch {
				setPhase("fatal");
				setFatalMessage(
					"Camera access is required to sign in with Face ID on this browser.",
				);
			}
		}

		void boot();

		// Consolidated cleanup: cancel rAF, stop tracks, close landmarker, abort fetch.
		return () => {
			cancelled = true;
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			landmarkerRef.current?.close();
			landmarkerRef.current = null;
			const stream = streamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) track.stop();
				streamRef.current = null;
			}
			abortRef.current?.abort();
			abortRef.current = null;
		};
	}, []);

	// Submit current frame. Single in-flight enforced by inFlightRef.
	const submitCurrentFrame = useCallback(async () => {
		if (inFlightRef.current) return;
		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;

		// Record per-attempt timestamps for the give-up timer.
		if (firstAttemptAtRef.current === null) {
			firstAttemptAtRef.current = performance.now();
		}
		attemptCountRef.current += 1;

		inFlightRef.current = true;
		setPhase("verifying");
		setStatusMessage("Verifying…");

		try {
			const dataUrl = captureFullVideoFrame(video, canvas);
			if (!dataUrl) throw new Error("Unable to capture the current frame.");
			const file = dataUrlToFile(dataUrl, `face-login-${Date.now()}.jpg`);
			if (!file) throw new Error("Unable to capture the current frame.");

			const result = await onSubmit(file);
			if (result.ok) {
				setWelcomeName(result.userName);
				setPhase("success");
				return;
			}

			// Failure path: decide between retry or terminal giveup.
			lastFailAtRef.current = performance.now();
			const isTerminal =
				result.terminal === true ||
				(result.errorCode !== undefined &&
					TERMINAL_ERROR_CODES.has(result.errorCode));
			const hitCap = attemptCountRef.current >= MAX_ATTEMPTS;
			const hitTimeout =
				firstAttemptAtRef.current !== null &&
				performance.now() - firstAttemptAtRef.current >= GIVEUP_AFTER_MS;

			if (isTerminal || hitCap || hitTimeout) {
				setStatusMessage(
					result.message ?? "Couldn't recognize you.",
				);
				setPhase("giveup");
			} else {
				// Reset stability window so we re-verify quality before next attempt.
				stabilityStartAtRef.current = null;
				stabilityCenterRef.current = null;
				maxDriftRef.current = 0;
				setPhase("searching");
				setStatusMessage("Looking for you…");
			}
		} catch (err) {
			lastFailAtRef.current = performance.now();
			if ((err as Error)?.name === "AbortError") return;
			setStatusMessage(
				err instanceof Error ? err.message : "Couldn't recognize you.",
			);
			if (attemptCountRef.current >= MAX_ATTEMPTS) {
				setPhase("giveup");
			} else {
				setPhase("searching");
			}
		} finally {
			inFlightRef.current = false;
		}
	}, [onSubmit]);

	// ---------- Detection loop ----------
	useEffect(() => {
		if (phase !== "searching" && phase !== "holding") {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			return;
		}

		const tick = (ts: number) => {
			rafRef.current = requestAnimationFrame(tick);

			// Throttle landmark analysis.
			if (ts - lastAnalysisAtRef.current < ANALYSIS_INTERVAL_MS) return;
			lastAnalysisAtRef.current = ts;

			const video = videoRef.current;
			const landmarker = landmarkerRef.current;
			if (!video || !landmarker) return;
			if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

			// Don't submit while another request is in flight or during back-off window.
			const canSubmitNow =
				!inFlightRef.current &&
				ts - lastFailAtRef.current >= FAIL_BACKOFF_MS;

			const result = landmarker.detectForVideo(video, performance.now());
			const faces = result.faceLandmarks;

			if (faces.length === 0) {
				telemetryRef.current = {
					drift: 0,
					evalResult: null,
					gate: "no-face",
				};
				stabilityStartAtRef.current = null;
				stabilityCenterRef.current = null;
				maxDriftRef.current = 0;
				if (phaseRef.current !== "searching") setPhase("searching");
				setStatusMessage(GATE_MESSAGE["no-face"]);
				if (debugOn) setDebugTick((n) => n + 1);
				return;
			}

			if (faces.length > 1) {
				telemetryRef.current = {
					drift: 0,
					evalResult: null,
					gate: "multi-face",
				};
				stabilityStartAtRef.current = null;
				stabilityCenterRef.current = null;
				if (phaseRef.current !== "searching") setPhase("searching");
				setStatusMessage(GATE_MESSAGE["multi-face"]);
				if (debugOn) setDebugTick((n) => n + 1);
				return;
			}

			const landmarks = faces[0] as Point2D[];
			const evalResult = evaluateLandmarks(landmarks);
			if (!evalResult) {
				telemetryRef.current = {
					drift: 0,
					evalResult: null,
					gate: "missing-landmarks",
				};
				stabilityStartAtRef.current = null;
				if (phaseRef.current !== "searching") setPhase("searching");
				setStatusMessage(GATE_MESSAGE["missing-landmarks"]);
				if (debugOn) setDebugTick((n) => n + 1);
				return;
			}

			if (evalResult.gate !== "ok") {
				// Any failing gate resets the stability window immediately.
				telemetryRef.current = {
					drift: 0,
					evalResult,
					gate: evalResult.gate,
				};
				stabilityStartAtRef.current = null;
				stabilityCenterRef.current = null;
				maxDriftRef.current = 0;
				if (phaseRef.current !== "searching") setPhase("searching");
				setStatusMessage(GATE_MESSAGE[evalResult.gate]);
				if (debugOn) setDebugTick((n) => n + 1);
				return;
			}

			// All gates pass — promote to "holding" and start/continue the stability timer.
			if (stabilityStartAtRef.current === null) {
				stabilityStartAtRef.current = ts;
				stabilityCenterRef.current = {
					x: evalResult.bbox.cx,
					y: evalResult.bbox.cy,
				};
				maxDriftRef.current = 0;
			} else if (stabilityCenterRef.current) {
				const dx = evalResult.bbox.cx - stabilityCenterRef.current.x;
				const dy = evalResult.bbox.cy - stabilityCenterRef.current.y;
				const drift = Math.hypot(dx, dy);
				if (drift > maxDriftRef.current) maxDriftRef.current = drift;
				if (drift > FACE_STABILITY_MAX_DRIFT) {
					// Jittery ⇒ treat as unstable; reset window.
					telemetryRef.current = {
						drift,
						evalResult,
						gate: "unstable",
					};
					stabilityStartAtRef.current = ts;
					stabilityCenterRef.current = {
						x: evalResult.bbox.cx,
						y: evalResult.bbox.cy,
					};
					maxDriftRef.current = 0;
					if (phaseRef.current !== "searching") setPhase("searching");
					setStatusMessage(GATE_MESSAGE.unstable);
					if (debugOn) setDebugTick((n) => n + 1);
					return;
				}
			}

			telemetryRef.current = {
				drift: maxDriftRef.current,
				evalResult,
				gate: "ok",
			};
			if (phaseRef.current !== "holding") setPhase("holding");
			setStatusMessage(GATE_MESSAGE.ok);
			if (debugOn) setDebugTick((n) => n + 1);

			// Stability window complete & submit is allowed (no in-flight, back-off elapsed).
			if (
				canSubmitNow &&
				ts - (stabilityStartAtRef.current ?? ts) >= FACE_STABILITY_MS
			) {
				void submitCurrentFrame();
			}
		};

		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [debugOn, phase, submitCurrentFrame]);

	// ---------- Debug overlay: bbox outline on a dedicated canvas ----------
	useEffect(() => {
		if (!debugOn) return;
		const video = videoRef.current;
		const canvas = debugCanvasRef.current;
		if (!video || !canvas) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (canvas.width !== w) canvas.width = w;
		if (canvas.height !== h) canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, w, h);
		const ev = telemetryRef.current.evalResult;
		if (!ev) return;
		const { bbox } = ev;
		// CSS transforms the video with mirror? In this app the video isn't mirrored.
		const x = (bbox.cx - bbox.w / 2) * w;
		const y = (bbox.cy - bbox.h / 2) * h;
		ctx.strokeStyle =
			telemetryRef.current.gate === "ok" ? "#34d399" : "#f97316";
		ctx.lineWidth = 2;
		ctx.strokeRect(x, y, bbox.w * w, bbox.h * h);
	}, [debugOn, debugTick]);

	const canClose = phase !== "verifying";

	const handleRetry = useCallback(() => {
		// Reset all per-session counters and resume detection.
		attemptCountRef.current = 0;
		firstAttemptAtRef.current = null;
		lastFailAtRef.current = 0;
		stabilityStartAtRef.current = null;
		stabilityCenterRef.current = null;
		maxDriftRef.current = 0;
		inFlightRef.current = false;
		setPhase("searching");
		setStatusMessage("Looking for you…");
	}, []);

	const tele = telemetryRef.current;

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-6">
			<div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl ring-1 ring-white/10">
				<div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
					<div>
						<h3 className="text-lg font-bold">Face ID Sign In</h3>
						<p className="mt-1 text-sm text-white/55">
							Signing in as {email}
						</p>
					</div>
					<button
						type="button"
						onClick={onCancel}
						disabled={!canClose}
						className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
					>
						<span className="material-symbols-outlined">close</span>
					</button>
				</div>

				<div className="grid gap-0 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
					<div className="relative flex min-h-[440px] items-center justify-center bg-black p-4 sm:p-6 lg:min-h-[720px]">
						<div className="relative aspect-[640/770] h-full max-h-[70vh] w-full max-w-[640px] overflow-hidden rounded-[32px] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
							<video
								ref={videoRef}
								autoPlay
								muted
								playsInline
								className="absolute inset-0 h-full w-full object-cover"
							/>
							<canvas ref={canvasRef} className="hidden" />
							{debugOn && (
								<canvas
									ref={debugCanvasRef}
									className="pointer-events-none absolute inset-0 h-full w-full"
								/>
							)}
							{/* Subtle frame tint reflects detection state — no oval guide,
							    login just auto-detects any face in view. */}
							<div
								className={`pointer-events-none absolute inset-0 rounded-[32px] border-2 transition-colors ${
									phase === "holding" || phase === "verifying"
										? "border-emerald-300/60"
										: phase === "success"
											? "border-emerald-400/80"
											: phase === "giveup"
												? "border-rose-300/60"
												: "border-white/10"
								}`}
							/>
						</div>

						{phase === "verifying" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/60">
								<div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-cyan-300" />
								<p className="text-sm font-semibold">Verifying…</p>
							</div>
						)}

						{phase === "success" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-emerald-950/55 text-center">
								<span className="material-symbols-outlined text-7xl text-emerald-300">
									check_circle
								</span>
								<p className="text-xl font-bold">
									Welcome{welcomeName ? `, ${welcomeName}` : ""}!
								</p>
							</div>
						)}

						{phase === "fatal" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-red-950/65 px-6 text-center">
								<span className="material-symbols-outlined text-7xl text-red-300">
									error
								</span>
								<p className="text-lg font-bold">Camera unavailable</p>
								<p className="max-w-sm text-sm text-red-100/85">
									{fatalMessage}
								</p>
							</div>
						)}

						{debugOn && (
							<div className="absolute left-6 top-6 rounded-lg bg-black/70 px-3 py-2 font-mono text-[10px] leading-relaxed text-cyan-200">
								<div>phase: {phase}</div>
								<div>gate: {tele.gate}</div>
								<div>inFlight: {String(inFlightRef.current)}</div>
								<div>attempts: {attemptCountRef.current}</div>
								<div>
									elapsed:{" "}
									{firstAttemptAtRef.current === null
										? "–"
										: `${Math.round(
												performance.now() - firstAttemptAtRef.current,
											)}ms`}
								</div>
								{tele.evalResult && (
									<>
										<div>
											bbox: {tele.evalResult.bbox.cx.toFixed(2)},
											{tele.evalResult.bbox.cy.toFixed(2)} |{" "}
											{tele.evalResult.bbox.w.toFixed(2)}×
											{tele.evalResult.bbox.h.toFixed(2)}
										</div>
										<div>
											yaw: {tele.evalResult.yaw.toFixed(3)} pitch:{" "}
											{tele.evalResult.pitch.toFixed(3)}
										</div>
										<div>drift: {tele.drift.toFixed(4)}</div>
									</>
								)}
							</div>
						)}
					</div>

					<div className="flex min-h-[440px] flex-col gap-5 bg-slate-900 px-6 py-6 lg:min-h-[720px]">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
								Face ID
							</p>
							<p className="mt-2 text-2xl font-bold">
								{phase === "success"
									? `Welcome${welcomeName ? `, ${welcomeName}` : ""}!`
									: phase === "giveup"
										? "Couldn't recognize you"
										: phase === "fatal"
											? "Camera unavailable"
											: phase === "verifying"
												? "Verifying…"
												: phase === "holding"
													? "Hold still…"
													: "Looking for you…"}
							</p>
							<p className="mt-2 text-sm text-white/60">{statusMessage}</p>
						</div>

						<div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
							{phase === "giveup" ? (
								<button
									type="button"
									onClick={handleRetry}
									className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
								>
									<span className="material-symbols-outlined text-[18px]">
										refresh
									</span>
									Try again
								</button>
							) : (
								<p className="text-sm text-white/60">
									Just look at the camera — sign-in happens automatically.
								</p>
							)}
							<button
								type="button"
								onClick={onCancel}
								disabled={!canClose}
								className="flex w-full items-center justify-center rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function LoginCard() {
	const [tab, setTab] = useState<Tab>("student");
	const [showPassword, setShowPassword] = useState(false);
	const [studentId, setStudentId] = useState("");
	const [studentPassword, setStudentPassword] = useState("");
	const [adminId, setAdminId] = useState("");
	const [adminOTP, setAdminOTP] = useState("");
	const [rememberMe, setRememberMe] = useState(false);
	const [otpSent, setOtpSent] = useState(false);
	const [otpCooldown, setOtpCooldown] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSendingOtp, setIsSendingOtp] = useState(false);
	const [isSubmittingFaceId, setIsSubmittingFaceId] = useState(false);
	const [isFaceIdOverlayOpen, setIsFaceIdOverlayOpen] = useState(false);
	const [fingerprintStatus, setFingerprintStatus] =
		useState<BrowserFingerprintStatus>("idle");
	const [browserIdentity, setBrowserIdentity] = useState<BrowserIdentity | null>(
		null,
	);
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [faceIdNotice, setFaceIdNotice] = useState("");

	const router = useRouter();

	const resetMessages = () => {
		setErrorMessage("");
		setSuccessMessage("");
		setFaceIdNotice("");
	};

	useEffect(() => {
		const cachedIdentity = getCachedBrowserIdentity();

		if (!cachedIdentity) {
			return;
		}

		setBrowserIdentity(cachedIdentity);
		setFingerprintStatus("ready");
	}, []);

	useEffect(() => {
		if (tab !== "admin") {
			return;
		}

		if (
			fingerprintStatus === "loading" ||
			fingerprintStatus === "ready" ||
			fingerprintStatus === "failed"
		) {
			return;
		}

		let cancelled = false;

		async function loadFingerprint() {
			setFingerprintStatus("loading");

			try {
				const identity = await getBrowserIdentity();

				if (cancelled) {
					return;
				}

				setBrowserIdentity(identity);
				setFingerprintStatus("ready");
			} catch {
				if (cancelled) {
					return;
				}

				setBrowserIdentity(null);
				setFingerprintStatus("failed");
			}
		}

		void loadFingerprint();

		return () => {
			cancelled = true;
		};
	}, [fingerprintStatus, tab]);

	const resolveBrowserIdentity = async () => {
		if (browserIdentity) {
			return browserIdentity;
		}

		setFingerprintStatus("loading");

		try {
			const identity = await getBrowserIdentity();
			setBrowserIdentity(identity);
			setFingerprintStatus("ready");
			return identity;
		} catch {
			setBrowserIdentity(null);
			setFingerprintStatus("failed");
			return null;
		}
	};

	useEffect(() => {
		if (otpCooldown <= 0) {
			return;
		}

		const timer = window.setTimeout(() => {
			setOtpCooldown((seconds) => seconds - 1);
		}, 1000);

		return () => window.clearTimeout(timer);
	}, [otpCooldown]);

	const getAdminEmailError = (value: string) => {
		const email = value.trim();

		if (!email) {
			return "Enter your admin email first.";
		}

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return "Enter a complete admin email address.";
		}

		return null;
	};

	const handleStudentLogin = async () => {
		const response = await fetch("/api/auth/student/login", {
			body: JSON.stringify({
				password: studentPassword,
				rememberMe,
				username: studentId,
			}),
			cache: "no-store",
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		});
		const payload = await readApiPayload(response);

		if (!response.ok) {
			throw new Error(
				getApiErrorMessage(payload, response.statusText || "Request failed."),
			);
		}

		router.push(payload?.nextPage || "/student/dashboard");
	};

	const handleSendAdminOtp = async () => {
		const emailError = getAdminEmailError(adminId);

		if (emailError) {
			setErrorMessage(emailError);
			return;
		}

		if (otpCooldown > 0) {
			setErrorMessage(`Wait ${otpCooldown}s before requesting another OTP.`);
			return;
		}

		resetMessages();
		setIsSendingOtp(true);

		try {
			const response = await fetch("/api/auth/admin/otp/send", {
				body: JSON.stringify({
					email: adminId.trim(),
				}),
				cache: "no-store",
				headers: {
					"Content-Type": "application/json",
				},
				method: "POST",
			});
			const payload = await readApiPayload(response);

			if (!response.ok) {
				throw new Error(getApiErrorMessage(payload, "Unable to send OTP."));
			}

			setOtpSent(true);
			setOtpCooldown(30);
			setSuccessMessage("OTP sent to your email.");
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to send OTP.",
			);
		} finally {
			setIsSendingOtp(false);
		}
	};

	const handleAdminLogin = async () => {
		const identity = await resolveBrowserIdentity();
		const requestBody: Record<string, unknown> = {
			email: adminId.trim(),
			otp: adminOTP,
			rememberMe,
		};

		if (identity) {
			requestBody.browserFingerprint = identity.browserFingerprint;
			requestBody.browserLabel = identity.browserLabel;
		} else {
			setFaceIdNotice(
				"Fingerprint is unavailable on this browser. OTP login can continue, but Face ID cannot be enabled here yet.",
			);
		}

		const response = await fetch("/api/auth/admin/otp/verify", {
			body: JSON.stringify(requestBody),
			cache: "no-store",
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		});
		const payload = await readApiPayload(response);

		if (!response.ok) {
			throw new Error(getApiErrorMessage(payload, "Unable to sign in."));
		}

		router.push(payload?.nextPage || "/admin/dashboard");
	};

	const handleFaceIdLogin = async (
		file: File,
	): Promise<FaceLoginSubmitResult> => {
		const emailError = getAdminEmailError(adminId);

		if (emailError) {
			setErrorMessage(emailError);
			return { message: emailError, ok: false, terminal: true };
		}

		resetMessages();
		setIsSubmittingFaceId(true);

		try {
			const identity = await resolveBrowserIdentity();

			if (!identity) {
				setFaceIdNotice(
					"We could not identify this browser. Please sign in with OTP instead.",
				);
				return {
					message:
						"We could not identify this browser. Please sign in with OTP instead.",
					ok: false,
					terminal: true,
				};
			}

			const formData = new FormData();
			formData.append("email", adminId.trim());
			formData.append("browserFingerprint", identity.browserFingerprint);
			formData.append("browserLabel", identity.browserLabel);
			formData.append("image", file);

			const response = await fetch("/api/auth/admin/faceid/login", {
				body: formData,
				method: "POST",
			});
			const payload = await readApiPayload(response);

			if (!response.ok) {
				const notice = getFaceIdBrowserNotice(payload?.errorCode);
				if (notice) setFaceIdNotice(notice);
				return {
					errorCode: payload?.errorCode,
					message: getApiErrorMessage(
						payload,
						"Unable to sign in with Face ID.",
					),
					ok: false,
				};
			}

			// Success: delay the redirect briefly so the overlay can show "Welcome!"
			const target = payload?.nextPage || "/admin/dashboard";
			window.setTimeout(() => {
				setIsFaceIdOverlayOpen(false);
				router.push(target);
			}, 600);

			return { nextPage: target, ok: true };
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to sign in with Face ID.";
			setErrorMessage(message);
			return { message, ok: false };
		} finally {
			setIsSubmittingFaceId(false);
		}
	};

	const handleFaceIdButtonClick = async () => {
		resetMessages();

		const emailError = getAdminEmailError(adminId);

		if (emailError) {
			setErrorMessage(emailError);
			return;
		}

		const identity = await resolveBrowserIdentity();

		if (!identity) {
			setFaceIdNotice(
				"We could not identify this browser. Please sign in with OTP instead.",
			);
			return;
		}

		setIsFaceIdOverlayOpen(true);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		resetMessages();
		setIsSubmitting(true);

		try {
			if (tab === "student") {
				if (!studentId.trim() || !studentPassword) {
					setErrorMessage("Enter your student ID and password.");
					return;
				}

				await handleStudentLogin();
				return;
			}

			const emailError = getAdminEmailError(adminId);

			if (emailError) {
				setErrorMessage(emailError);
				return;
			}

			if (!adminOTP.trim()) {
				setErrorMessage("Enter the OTP sent to your admin email.");
				return;
			}

			await handleAdminLogin();
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to sign in.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const canUseFaceId =
		getAdminEmailError(adminId) === null &&
		fingerprintStatus !== "loading" &&
		fingerprintStatus !== "failed";

	return (
		<>
			{isFaceIdOverlayOpen && (
				<FaceIdLoginOverlay
					email={adminId.trim()}
					onCancel={() => {
						if (isSubmittingFaceId) {
							return;
						}

						setIsFaceIdOverlayOpen(false);
					}}
					onSubmit={handleFaceIdLogin}
				/>
			)}

			<div className="glass-panel overflow-hidden rounded-xl p-8 shadow-sm md:p-10">
				<div className="mb-8 text-center">
					<h1 className="mb-2 font-headline text-2xl font-extrabold text-on-surface">
						Welcome Back
					</h1>
					<p className="text-sm text-on-surface-variant">
						Access your academic and administrative portal.
					</p>
				</div>

				<div className="mb-8 flex rounded-lg bg-surface-container-low p-1">
					<button
						type="button"
						onClick={() => setTab("student")}
						className={`flex-1 rounded-md py-2 text-sm font-semibold transition-all duration-200 ${tab === "student" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-high"}`}
					>
						Student
					</button>
					<button
						type="button"
						onClick={() => setTab("admin")}
						className={`flex-1 rounded-md py-2 text-sm font-semibold transition-all duration-200 ${tab === "admin" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-high"}`}
					>
						Admin
					</button>
				</div>

				<form className="space-y-6" onSubmit={handleSubmit}>
					{tab === "student" ? (
						<div className="space-y-5">
							<div className="space-y-2">
								<label className="ml-1 block font-label text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
									Student ID
								</label>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										badge
									</span>
									<input
										type="text"
										placeholder="STU........"
										value={studentId}
										onChange={(e) => setStudentId(e.target.value)}
										disabled={isSubmitting || isSubmittingFaceId}
										className="w-full rounded-lg border-none bg-surface-container-highest py-3 pl-12 pr-4 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary/40"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<label className="ml-1 block font-label text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
									Password
								</label>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										lock
									</span>
									<input
										type={showPassword ? "text" : "password"}
										placeholder="••••••••"
										autoComplete="current-password"
										name="password"
										value={studentPassword}
										onChange={(e) => setStudentPassword(e.target.value)}
										disabled={isSubmitting || isSubmittingFaceId}
										className="w-full rounded-lg border-none bg-surface-container-highest py-3 pl-12 pr-12 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary/40"
									/>
									<button
										type="button"
										onClick={() => setShowPassword((v) => !v)}
										disabled={isSubmitting || isSubmittingFaceId}
										className="absolute right-4 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-primary"
									>
										<span className="material-symbols-outlined text-lg">
											{showPassword ? "visibility_off" : "visibility"}
										</span>
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="space-y-5">
							<div className="space-y-2">
								<label className="ml-1 block font-label text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
									Email
								</label>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										mail
									</span>
									<input
										type="email"
										placeholder="Your email address..."
										value={adminId}
										onChange={(e) => {
											setAdminId(e.target.value);
											setErrorMessage("");
											setFaceIdNotice("");
										}}
										disabled={
											isSubmitting ||
											isSendingOtp ||
											isSubmittingFaceId
										}
										className="w-full rounded-lg border-none bg-surface-container-highest py-3 pl-12 pr-4 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary/40"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between px-1">
									<label className="block font-label text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
										OTP (One-Time Password)
									</label>
									<button
										type="button"
										onClick={handleSendAdminOtp}
										disabled={
											isSubmitting ||
											isSendingOtp ||
											isSubmittingFaceId ||
											otpCooldown > 0
										}
										className="text-[10px] font-bold text-primary hover:underline disabled:no-underline"
									>
										{isSendingOtp
											? "Sending..."
											: otpCooldown > 0
												? `Resend in ${otpCooldown}s`
												: otpSent
													? "Resend OTP"
													: "Send OTP"}
									</button>
								</div>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										key
									</span>
									<input
										type="text"
										maxLength={6}
										placeholder="000000"
										value={adminOTP}
										onChange={(e) => setAdminOTP(e.target.value)}
										disabled={isSubmitting || isSubmittingFaceId}
										className="w-full rounded-lg border-none bg-surface-container-highest py-3 pl-12 pr-4 font-mono text-sm tracking-[0.5em] outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary/40"
									/>
								</div>
							</div>
						</div>
					)}

					<div className="flex items-center justify-between px-1">
						<label className="group flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={rememberMe}
								onChange={(e) => setRememberMe(e.target.checked)}
								disabled={isSubmitting || isSendingOtp || isSubmittingFaceId}
								className="h-4 w-4 rounded border-outline-variant/50 bg-surface-container-highest text-primary focus:ring-primary"
							/>
							<span className="text-xs text-on-surface-variant transition-colors group-hover:text-on-surface">
								Remember me
							</span>
						</label>
						{tab === "student" && (
							<a
								href="#"
								className="text-xs font-semibold text-primary hover:underline"
							>
								Forgot password?
							</a>
						)}
					</div>

					{errorMessage && (
						<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{errorMessage}
						</p>
					)}

					{successMessage && (
						<p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
							{successMessage}
						</p>
					)}

					{faceIdNotice && (
						<p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
							{faceIdNotice}
						</p>
					)}

					<button
						type="submit"
						disabled={isSubmitting || isSubmittingFaceId}
						className="signature-gradient w-full rounded-lg py-3.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
					>
						{isSubmitting ? "Signing In..." : "Sign In to Dashboard"}
					</button>

					{tab === "admin" && (
						<>
							<div className="relative flex items-center gap-3">
								<div className="h-px flex-1 bg-slate-200" />
								<span className="text-xs font-medium text-slate-400">
									or
								</span>
								<div className="h-px flex-1 bg-slate-200" />
							</div>

							<button
								type="button"
								onClick={() => void handleFaceIdButtonClick()}
								disabled={
									!canUseFaceId ||
									isSubmitting ||
									isSendingOtp ||
									isSubmittingFaceId
								}
								className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-indigo-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<span className="material-symbols-outlined text-[20px] text-indigo-500">
									face_retouching_natural
								</span>
								{isSubmittingFaceId
									? "Verifying Face ID..."
									: "Sign in with Face ID"}
							</button>

							<p className="text-center text-xs text-slate-400">
								{fingerprintStatus === "failed"
									? "Face ID is unavailable because this browser could not be identified. Use OTP instead."
									: fingerprintStatus === "loading"
										? "Checking browser identity before Face ID login."
										: canUseFaceId
											? "Enter your admin email, then verify with a live camera capture."
											: "Nhap email admin hop le truoc khi dang nhap bang Face ID."}
							</p>
						</>
					)}
				</form>
			</div>
		</>
	);
}
