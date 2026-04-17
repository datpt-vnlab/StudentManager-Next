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
	FACE_LOGIN_GENERIC_FAILURE,
	getFaceIdBrowserNotice,
	mapFaceIdErrorMessage,
} from "@/app/lib/face-id";
import { dataUrlToFile } from "@/app/lib/face-id-camera";
import FaceChallengeOverlay, {
	type ChallengePrompt,
} from "@/app/ui/login/face-challenge-overlay";

// =====================================================================
// Face-login tunables (single source of truth)
// =====================================================================
// --- Quality gate thresholds ---
// Minimum face bbox height as fraction of frame (user close enough).
const FACE_MIN_HEIGHT = 0.25;
// Maximum face bbox height (not clipped at edges).
const FACE_MAX_HEIGHT = 0.9;
// Bbox center must be within ±15% of frame center on both axes.
const FACE_CENTER_TOLERANCE = 0.15;
// Key landmarks must stay ≥5% away from every edge (spec: "full face fully
// inside the video frame"). This catches partial faces that bbox checks miss.
const FACE_EDGE_SAFE_MARGIN = 0.05;
// Yaw proxy: (eye-to-nose) asymmetry; ~0.15 corresponds to roughly |yaw| > 15°.
const FACE_YAW_TOLERANCE = 0.15;
// Pitch proxy: normalized nose offset vs eye/mouth midline.
const FACE_PITCH_TOLERANCE = 0.15;
// Bbox center drift (fraction of frame) must stay under this across the
// stability window — proxy for "not motion-blurred".
const FACE_STABILITY_MAX_DRIFT = 0.02;
// Face must remain gated-ok and still for this long before we move to capture.
const FACE_STABILITY_MS = 300;
// Cap MediaPipe analysis cadence to avoid redundant work per frame.
const ANALYSIS_INTERVAL_MS = 90;

// --- Capture timing ---
// Silent phase: 5 thumbs over ~800ms (every ~200ms) + 1 full at midpoint.
const SILENT_FRAME_COUNT = 5;
const SILENT_FRAME_INTERVAL_MS = 200;
const SILENT_FULL_FRAME_AT_MS = 400;
// Challenge phase: 5 thumbs over ~1.0s (every ~250ms) + 1 full at midpoint.
// User only needs to HOLD the requested pose (look_left/right/up/down) for
// this window — no dynamic motion needed, so the window is short.
// Slots are SCHEDULED times; actual capture retries each rAF until the face
// lands inside the (relaxed) edge margin, bounded by CHALLENGE_MAX_CAPTURE_MS.
const CHALLENGE_FRAME_COUNT = 5;
const CHALLENGE_FRAME_INTERVAL_MS = 250;
const CHALLENGE_FULL_FRAME_AT_MS = 500;
// Static pose hold — 3s is plenty of slack for retries on out-of-frame
// ticks (a turned head can push landmarks near edges).
const CHALLENGE_MAX_CAPTURE_MS = 3000;
// Read window so the user actually sees/understands the arrow/text
// before we start timing the motion capture.
const CHALLENGE_PROMPT_READ_MS = 900;
// Edge margin during challenge is DELIBERATELY laxer than the silent gate —
// a look_left/right turn pushes landmarks near frame edges, so we only
// reject captures where the face is truly clipping the frame.
const CHALLENGE_EDGE_SAFE_MARGIN = 0.01;

// --- Thumb / full-frame encoding ---
const THUMB_SIZE = 200;
const THUMB_QUALITY = 0.7;
const THUMB_FACE_MARGIN = 0.3; // expand bbox by 30% before crop
const FULL_MAX_EDGE = 800;
const FULL_QUALITY = 0.85;

// --- Global timeout ---
// If the whole login hasn't succeeded within this, stop auto-loop and show Retry.
// Must comfortably fit: gating (~0.3s) + nonce (~0.3s) + silent capture (~0.8s)
// + silent upload (~1s) + prompt read (~0.9s) + challenge capture (up to 3s)
// + challenge upload (~1s) + success anim (~0.6s) ≈ 8s, with headroom for
// slow networks / cold MediaPipe detect.
const GLOBAL_TIMEOUT_MS = 18_000;

const MEDIAPIPE_WASM_ROOT =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const FACE_LANDMARKER_MODEL_ASSET =
	"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Point2D = { x: number; y: number };

// MediaPipe face-landmark indices used for pose and edge-safety checks.
const LM = {
	chin: 152,
	forehead: 10,
	leftEyeInner: 133,
	leftEyeOuter: 33,
	mouthBottom: 14,
	mouthLeft: 61,
	mouthRight: 291,
	mouthTop: 13,
	noseTip: 1,
	rightEyeInner: 362,
	rightEyeOuter: 263,
} as const;

// The "key facial landmarks" the spec says must all sit inside the safe margin.
const EDGE_CHECK_INDICES = [
	LM.leftEyeOuter,
	LM.rightEyeOuter,
	LM.leftEyeInner,
	LM.rightEyeInner,
	LM.noseTip,
	LM.mouthLeft,
	LM.mouthRight,
	LM.chin,
	LM.forehead,
] as const;

type GateReason =
	| "ok"
	| "no-face"
	| "multi-face"
	| "too-far"
	| "too-close"
	| "off-center-x"
	| "off-center-y"
	| "edge"
	| "yaw"
	| "pitch"
	| "unstable"
	| "missing-landmarks";

const GATE_MESSAGE: Record<GateReason, string> = {
	edge: "Center your face.",
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
	worstEdgeDist: number; // min distance-to-edge among the checked landmarks
};

/**
 * Per-frame quality gate. Pure. Returns null if required landmarks are
 * missing. Order of checks: multi-face is handled by caller (this function
 * assumes exactly one face). We run the cheap gates first (size, centering,
 * edge margin) before pose (yaw/pitch) since those dominate failures early.
 */
function evaluateLandmarks(landmarks: Point2D[]): LandmarkEval | null {
	const nose = landmarks[LM.noseTip];
	const lEye = landmarks[LM.leftEyeOuter];
	const rEye = landmarks[LM.rightEyeOuter];
	const mTop = landmarks[LM.mouthTop];
	const mBot = landmarks[LM.mouthBottom];
	if (!nose || !lEye || !rEye || !mTop || !mBot) return null;

	// Bounding box over all landmarks. Normalised in [0, 1].
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

	// Yaw / pitch proxies (see enroll section for the same formula).
	const dLeft = Math.abs(nose.x - lEye.x);
	const dRight = Math.abs(rEye.x - nose.x);
	const denom = Math.max(dLeft + dRight, 1e-6);
	const yaw = (dRight - dLeft) / denom;

	const eyeY = (lEye.y + rEye.y) / 2;
	const mouthY = (mTop.y + mBot.y) / 2;
	const midY = (eyeY + mouthY) / 2;
	const spanY = Math.max(mouthY - eyeY, 1e-6);
	const pitch = (nose.y - midY) / spanY;

	// Key-landmark edge-safety check. Every listed landmark must sit inside
	// [margin, 1 - margin] on BOTH axes — catches partial faces where only
	// a side of the face is visible.
	let worstEdgeDist = 1;
	for (const idx of EDGE_CHECK_INDICES) {
		const p = landmarks[idx];
		if (!p) continue;
		const d = Math.min(p.x, 1 - p.x, p.y, 1 - p.y);
		if (d < worstEdgeDist) worstEdgeDist = d;
	}

	let gate: GateReason = "ok";
	if (h < FACE_MIN_HEIGHT) gate = "too-far";
	else if (h > FACE_MAX_HEIGHT) gate = "too-close";
	else if (worstEdgeDist < FACE_EDGE_SAFE_MARGIN) gate = "edge";
	// Centering is NOT enforced on login — as long as the full face is inside
	// the safe margin (edge check above) and at a reasonable size, any
	// position within the frame is fine for the backend matcher.
	else if (Math.abs(yaw) > FACE_YAW_TOLERANCE) gate = "yaw";
	else if (Math.abs(pitch) > FACE_PITCH_TOLERANCE) gate = "pitch";

	return { bbox, gate, pitch, worstEdgeDist, yaw };
}

// --------------------------------------------------------------
// Capture helpers
// --------------------------------------------------------------

/**
 * Crop the current video frame to the face bbox (expanded by
 * THUMB_FACE_MARGIN) and encode as a JPEG File at ~200x200, q=0.70.
 * Caller must provide the latest landmarks — we don't re-run MediaPipe here.
 */
function captureFaceThumb(
	video: HTMLVideoElement,
	canvas: HTMLCanvasElement,
	landmarks: Point2D[],
	filename: string,
): File | null {
	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (!vw || !vh) return null;

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

	// Expand by margin and square off so we get a roughly face-centered crop.
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const rawW = maxX - minX;
	const rawH = maxY - minY;
	const side = Math.max(rawW, rawH) * (1 + THUMB_FACE_MARGIN);
	const halfNorm = side / 2;

	const sxNorm = Math.max(0, cx - halfNorm);
	const syNorm = Math.max(0, cy - halfNorm);
	const exNorm = Math.min(1, cx + halfNorm);
	const eyNorm = Math.min(1, cy + halfNorm);

	const sx = Math.round(sxNorm * vw);
	const sy = Math.round(syNorm * vh);
	const sw = Math.max(1, Math.round((exNorm - sxNorm) * vw));
	const sh = Math.max(1, Math.round((eyNorm - syNorm) * vh));

	canvas.width = THUMB_SIZE;
	canvas.height = THUMB_SIZE;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	// Fill with black in case the src rect is non-square (letterbox-safe).
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
	ctx.drawImage(video, sx, sy, sw, sh, 0, 0, THUMB_SIZE, THUMB_SIZE);

	const dataUrl = canvas.toDataURL("image/jpeg", THUMB_QUALITY);
	return dataUrlToFile(dataUrl, filename);
}

/**
 * Capture the current video frame, downscaling so the longest edge is
 * FULL_MAX_EDGE, at JPEG quality FULL_QUALITY. Backend YuNet re-detects on
 * this image so we preserve aspect.
 */
function captureFullFrame(
	video: HTMLVideoElement,
	canvas: HTMLCanvasElement,
	filename: string,
): File | null {
	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (!vw || !vh) return null;
	const scale = Math.min(1, FULL_MAX_EDGE / Math.max(vw, vh));
	const w = Math.max(1, Math.round(vw * scale));
	const h = Math.max(1, Math.round(vh * scale));
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.drawImage(video, 0, 0, w, h);
	const dataUrl = canvas.toDataURL("image/jpeg", FULL_QUALITY);
	return dataUrlToFile(dataUrl, filename);
}

// --------------------------------------------------------------
// Types exported to the parent card
// --------------------------------------------------------------

type Tab = "student" | "admin";

export type FaceLoginSubmitResult =
	| { nextPage?: string; ok: true; userName?: string }
	| {
			errorCode?: string;
			message?: string;
			ok: false;
			terminal?: boolean;
	  };

// --------------------------------------------------------------
// Silent / challenge state machine
// --------------------------------------------------------------

type OverlayPhase =
	| "booting" // camera + landmarker warm-up
	| "gating" // waiting for quality gate to hold-ok
	| "requesting_nonce" // POST /nonce in flight
	| "capturing_silent" // 5 thumbs + 1 full over ~800ms
	| "uploading_silent" // POST /silent in flight
	| "challenge_prompt" // showing arrow/text, reading window
	| "capturing_challenge" // 5 thumbs + 1 full, skip out-of-frame
	| "uploading_challenge" // POST /challenge in flight
	| "success"
	| "retry" // generic failure + Retry button
	| "fatal"; // camera/model unavailable

type SilentResponse =
	| { status: "success"; livenessScore?: number; antispoofScore?: number; nextPage?: string; userName?: string }
	| { status: "challenge"; prompt: ChallengePrompt; challengeNonce: string; ttlSec?: number }
	| { status: "failed"; errorCode?: string };

type LastServerResp = {
	endpoint: "nonce" | "silent" | "challenge";
	httpStatus: number;
	status?: string;
	errorCode?: string;
};

type ApiError = {
	error?: string;
	errorCode?: string;
	errors?: string[];
	message?: string;
	nextPage?: string;
};

async function readApiPayload<T = ApiError>(response: Response): Promise<T | null> {
	try {
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

function getApiErrorMessage(payload: ApiError | null, fallback: string) {
	if (!payload) return fallback;
	if (payload.errorCode) {
		return mapFaceIdErrorMessage(payload.errorCode, fallback);
	}
	if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
	if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
	if (Array.isArray(payload.errors) && payload.errors.length > 0) return payload.errors.join(", ");
	return fallback;
}

// --------------------------------------------------------------
// Overlay component — owns the full silent/challenge flow
// --------------------------------------------------------------

function FaceIdLoginOverlay({
	email,
	identity,
	onClose,
	onSuccess,
}: {
	email: string;
	identity: BrowserIdentity;
	onClose: () => void;
	onSuccess: (nextPage: string, userName?: string) => void;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const landmarkerRef = useRef<MediaPipeFaceLandmarker | null>(null);
	const rafRef = useRef<number | null>(null);
	// Shared abort controller — cancels nonce/silent/challenge on unmount.
	const abortRef = useRef<AbortController | null>(null);
	// Outstanding setTimeout handles (capture schedule). Cleanup clears all.
	const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

	// Loop-internal refs (don't trigger re-renders):
	const lastAnalysisAtRef = useRef(0);
	// Single in-flight guard — no new fetch or capture starts while true.
	const inFlightRef = useRef(false);
	const stabilityStartAtRef = useRef<number | null>(null);
	const stabilityCenterRef = useRef<{ x: number; y: number } | null>(null);
	const maxDriftRef = useRef(0);
	const phaseRef = useRef<OverlayPhase>("booting");
	const firstGatingAtRef = useRef<number | null>(null);
	const lastLandmarksRef = useRef<Point2D[] | null>(null);
	const challengePromptRef = useRef<ChallengePrompt | null>(null);
	const challengeNonceRef = useRef<string | null>(null);
	// A nonce consumed by /silent cannot be reused — clear after upload.
	const nonceRef = useRef<string | null>(null);
	// True once we've already passed through a challenge (no chaining).
	const challengeConsumedRef = useRef(false);

	const telemetryRef = useRef<{
		drift: number;
		evalResult: LandmarkEval | null;
		gate: GateReason;
		lastResp: LastServerResp | null;
	}>({ drift: 0, evalResult: null, gate: "no-face", lastResp: null });

	const [phase, setPhase] = useState<OverlayPhase>("booting");
	const [statusMessage, setStatusMessage] = useState("Starting camera…");
	const [welcomeName, setWelcomeName] = useState<string | undefined>();
	const [fatalMessage, setFatalMessage] = useState("");
	const [challengePrompt, setChallengePrompt] =
		useState<ChallengePrompt | null>(null);
	const [debugTick, setDebugTick] = useState(0);

	const searchParams = useSearchParams();
	const debugOn = searchParams?.get("debug") === "1";

	useEffect(() => {
		phaseRef.current = phase;
	}, [phase]);

	// Helper: register a setTimeout that will be cleared on unmount.
	const schedule = useCallback(
		(fn: () => void, delayMs: number) => {
			const id = setTimeout(() => {
				timersRef.current.delete(id);
				fn();
			}, delayMs);
			timersRef.current.add(id);
			return id;
		},
		[],
	);

	const clearAllTimers = useCallback(() => {
		for (const id of timersRef.current) clearTimeout(id);
		timersRef.current.clear();
	}, []);

	// -------- Boot camera + FaceLandmarker + global timeout -----------------
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
						numFaces: 2, // detect >1 so we can reject multi-face
						outputFacialTransformationMatrixes: false,
						runningMode: "VIDEO",
					},
				);
				if (cancelled) {
					landmarker.close();
					return;
				}
				landmarkerRef.current = landmarker;
				setPhase("gating");
				setStatusMessage("Looking for you…");
			} catch {
				setPhase("fatal");
				setFatalMessage(
					"Camera access is required to sign in with Face ID on this browser.",
				);
			}
		}

		void boot();

		// Global 15s timeout — from first `gating` entry to a terminal phase.
		const timeoutTimer = setInterval(() => {
			const firstGating = firstGatingAtRef.current;
			if (firstGating === null) return;
			if (performance.now() - firstGating < GLOBAL_TIMEOUT_MS) return;
			const p = phaseRef.current;
			if (
				p === "success" ||
				p === "retry" ||
				p === "fatal"
			) {
				return;
			}
			// Abort any in-flight request and reset to retry.
			abortRef.current?.abort();
			inFlightRef.current = false;
			clearAllTimers();
			setStatusMessage(FACE_LOGIN_GENERIC_FAILURE);
			setPhase("retry");
		}, 500);

		// Consolidated cleanup: rAF, landmarker, camera tracks, fetch, timers.
		return () => {
			cancelled = true;
			clearInterval(timeoutTimer);
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
			clearAllTimers();
		};
	}, [clearAllTimers]);

	// -------- Handle terminal server responses ------------------------------
	const finishSuccess = useCallback(
		(resp: SilentResponse, httpStatus: number) => {
			if (resp.status !== "success") return;
			telemetryRef.current.lastResp = {
				endpoint: phaseRef.current === "uploading_challenge" ? "challenge" : "silent",
				httpStatus,
				status: "success",
			};
			const name = resp.userName;
			const nextPage = resp.nextPage ?? "/admin/dashboard";
			setWelcomeName(name);
			setPhase("success");
			// Small delay so the overlay's "Welcome!" state renders before redirect.
			schedule(() => onSuccess(nextPage, name), 600);
		},
		[onSuccess, schedule],
	);

	const finishFailure = useCallback(
		(errorCode: string | undefined, httpStatus: number, endpoint: "silent" | "challenge") => {
			// Log raw code for debugging, but NEVER surface it to the user — the
			// generic message prevents leaking which check tripped.
			if (errorCode) {
				// eslint-disable-next-line no-console
				console.warn("[face-login] failed", { endpoint, errorCode });
			}
			telemetryRef.current.lastResp = {
				endpoint,
				errorCode,
				httpStatus,
				status: "failed",
			};
			clearAllTimers();
			inFlightRef.current = false;
			setStatusMessage(FACE_LOGIN_GENERIC_FAILURE);
			setPhase("retry");
		},
		[clearAllTimers],
	);

	// -------- Upload phase --------------------------------------------------
	const uploadSilent = useCallback(
		async (thumbs: File[], full: File, nonce: string) => {
			if (inFlightRef.current) return; // single-flight guard
			inFlightRef.current = true;
			setPhase("uploading_silent");
			setStatusMessage("Verifying…");

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				const fd = new FormData();
				fd.append("nonce", nonce);
				fd.append("email", email);
				fd.append("browserFingerprint", identity.browserFingerprint);
				fd.append("browserLabel", identity.browserLabel);
				for (const f of thumbs) fd.append("frames", f);
				fd.append("full", full);

				const resp = await fetch("/api/auth/admin/faceid/silent", {
					body: fd,
					cache: "no-store",
					method: "POST",
					signal: controller.signal,
				});
				const payload = (await readApiPayload<SilentResponse & ApiError>(resp)) ?? null;
				const status = (payload as { status?: string } | null)?.status;
				telemetryRef.current.lastResp = {
					endpoint: "silent",
					errorCode: (payload as ApiError | null)?.errorCode,
					httpStatus: resp.status,
					status,
				};

				if (!resp.ok || !payload) {
					finishFailure(
						(payload as ApiError | null)?.errorCode,
						resp.status,
						"silent",
					);
					return;
				}

				if (payload.status === "success") {
					finishSuccess(payload, resp.status);
					return;
				}

				if (payload.status === "challenge") {
					challengePromptRef.current = payload.prompt;
					challengeNonceRef.current = payload.challengeNonce;
					setChallengePrompt(payload.prompt);
					setPhase("challenge_prompt");
					setStatusMessage("Follow the on-screen instruction.");
					inFlightRef.current = false;
					// Brief read window before we start capturing the motion.
					schedule(() => {
						void runChallengeCapture();
					}, CHALLENGE_PROMPT_READ_MS);
					return;
				}

				// status:"failed" or anything else unexpected
				finishFailure(
					(payload as { errorCode?: string }).errorCode,
					resp.status,
					"silent",
				);
			} catch (err) {
				if ((err as Error)?.name === "AbortError") return;
				finishFailure(undefined, 0, "silent");
			} finally {
				if (phaseRef.current !== "challenge_prompt") {
					inFlightRef.current = false;
				}
			}
		},
		// runChallengeCapture is defined below with useCallback; referenced via ref pattern.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[email, identity.browserFingerprint, identity.browserLabel, finishFailure, finishSuccess, schedule],
	);

	const uploadChallenge = useCallback(
		async (thumbs: File[], full: File, challengeNonce: string) => {
			if (inFlightRef.current) return;
			inFlightRef.current = true;
			setPhase("uploading_challenge");
			setStatusMessage("Verifying…");

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				const fd = new FormData();
				fd.append("challengeNonce", challengeNonce);
				fd.append("email", email);
				fd.append("browserFingerprint", identity.browserFingerprint);
				fd.append("browserLabel", identity.browserLabel);
				for (const f of thumbs) fd.append("frames", f);
				fd.append("full", full);

				const resp = await fetch("/api/auth/admin/faceid/challenge", {
					body: fd,
					cache: "no-store",
					method: "POST",
					signal: controller.signal,
				});
				const payload = (await readApiPayload<SilentResponse & ApiError>(resp)) ?? null;
				const status = (payload as { status?: string } | null)?.status;
				telemetryRef.current.lastResp = {
					endpoint: "challenge",
					errorCode: (payload as ApiError | null)?.errorCode,
					httpStatus: resp.status,
					status,
				};

				if (!resp.ok || !payload) {
					finishFailure(
						(payload as ApiError | null)?.errorCode,
						resp.status,
						"challenge",
					);
					return;
				}

				if (payload.status === "success") {
					finishSuccess(payload, resp.status);
					return;
				}

				// A second challenge is NOT chained — treat as failure.
				finishFailure(
					(payload as { errorCode?: string }).errorCode ??
						(payload.status === "challenge" ? "CHALLENGE_FAILED" : undefined),
					resp.status,
					"challenge",
				);
			} catch (err) {
				if ((err as Error)?.name === "AbortError") return;
				finishFailure(undefined, 0, "challenge");
			} finally {
				inFlightRef.current = false;
			}
		},
		[email, identity.browserFingerprint, identity.browserLabel, finishFailure, finishSuccess],
	);

	// -------- Challenge capture (rAF-timed, skip out-of-frame) --------------
	const runChallengeCapture = useCallback(async () => {
		if (challengeConsumedRef.current) {
			// Spec: don't chain — this should never re-fire, guard anyway.
			return;
		}
		challengeConsumedRef.current = true;
		const video = videoRef.current;
		const canvas = canvasRef.current;
		const landmarker = landmarkerRef.current;
		const prompt = challengePromptRef.current;
		const nonce = challengeNonceRef.current;
		if (!video || !canvas || !landmarker || !prompt || !nonce) {
			finishFailure("CHALLENGE_FAILED", 0, "challenge");
			return;
		}

		setPhase("capturing_challenge");
		setStatusMessage("Capturing…");
		inFlightRef.current = true;

		const thumbs: File[] = [];
		let full: File | null = null;
		const startedAt = performance.now();

		// Scheduled capture slots + full-frame midpoint.
		const slotMs: number[] = [];
		for (let i = 0; i < CHALLENGE_FRAME_COUNT; i++) {
			slotMs.push(i * CHALLENGE_FRAME_INTERVAL_MS);
		}
		let nextSlotIdx = 0;

		return await new Promise<void>((resolve) => {
			const loop = () => {
				const t = performance.now() - startedAt;

				// Hard abort if face keeps leaving frame past the max window.
				// But if we've managed to grab AT LEAST 3 thumbs + the full
				// frame, upload what we have and let the backend decide.
				// Previously we threw away partial captures and auto-failed.
				if (t > CHALLENGE_MAX_CAPTURE_MS) {
					if (thumbs.length >= 3) {
						if (!full) {
							full = captureFullFrame(
								video,
								canvas,
								`face-login-chal-full-${Date.now()}.jpg`,
							);
						}
						if (full) {
							inFlightRef.current = false;
							void uploadChallenge(thumbs, full, nonce).finally(resolve);
							return;
						}
					}
					finishFailure("CHALLENGE_FAILED", 0, "challenge");
					resolve();
					return;
				}

				// Midpoint full-frame grab (once).
				if (!full && t >= CHALLENGE_FULL_FRAME_AT_MS) {
					full = captureFullFrame(video, canvas, `face-login-chal-full-${Date.now()}.jpg`);
				}

				// Capture next thumb at its scheduled slot, but only if face is
				// still inside the frame per the latest MediaPipe result.
				if (
					nextSlotIdx < CHALLENGE_FRAME_COUNT &&
					t >= slotMs[nextSlotIdx]
				) {
					const det = landmarker.detectForVideo(video, performance.now());
					const faces = det.faceLandmarks;
					if (faces.length === 1) {
						const lms = faces[0] as Point2D[];
						lastLandmarksRef.current = lms;
						// Edge check — RELAXED vs the silent gate. A look_left/
						// look_right turn pushes landmarks toward edges. We
						// only reject when the face is truly clipping. If the
						// face is clipped, skip this slot (don't advance index)
						// and try next tick.
						let worst = 1;
						for (const idx of EDGE_CHECK_INDICES) {
							const p = lms[idx];
							if (!p) continue;
							const d = Math.min(p.x, 1 - p.x, p.y, 1 - p.y);
							if (d < worst) worst = d;
						}
						if (worst >= CHALLENGE_EDGE_SAFE_MARGIN) {
							const thumb = captureFaceThumb(
								video,
								canvas,
								lms,
								`face-login-chal-${nextSlotIdx}-${Date.now()}.jpg`,
							);
							if (thumb) {
								thumbs.push(thumb);
								nextSlotIdx += 1;
							}
						}
						// else: face out of frame this tick, retry on next rAF
					}
				}

				if (thumbs.length >= CHALLENGE_FRAME_COUNT) {
					// Ensure full is set (last-ditch).
					if (!full) {
						full = captureFullFrame(video, canvas, `face-login-chal-full-${Date.now()}.jpg`);
					}
					if (!full) {
						finishFailure("CHALLENGE_FAILED", 0, "challenge");
						resolve();
						return;
					}
					// Free the single-flight guard — uploadChallenge sets it again.
					inFlightRef.current = false;
					void uploadChallenge(thumbs, full, nonce).finally(resolve);
					return;
				}

				requestAnimationFrame(loop);
			};
			requestAnimationFrame(loop);
		});
	}, [finishFailure, uploadChallenge]);

	// -------- Silent capture (fixed-interval) -------------------------------
	const runSilentCapture = useCallback(
		async (nonce: string) => {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			const landmarker = landmarkerRef.current;
			if (!video || !canvas || !landmarker) return;

			setPhase("capturing_silent");
			setStatusMessage("Hold still…");
			// Keep single-flight held through capture AND upload.
			inFlightRef.current = true;

			const thumbs: File[] = [];
			let full: File | null = null;

			// Use the latest landmarks as the crop source for thumbs. We
			// re-detect per-slot for a fresh crop rect.
			for (let i = 0; i < SILENT_FRAME_COUNT; i++) {
				await new Promise<void>((resolve) => {
					schedule(() => {
						const det = landmarker.detectForVideo(
							video,
							performance.now(),
						);
						const faces = det.faceLandmarks;
						if (faces.length === 1) {
							const lms = faces[0] as Point2D[];
							lastLandmarksRef.current = lms;
							const thumb = captureFaceThumb(
								video,
								canvas,
								lms,
								`face-login-silent-${i}-${Date.now()}.jpg`,
							);
							if (thumb) thumbs.push(thumb);
						}
						resolve();
					}, i * SILENT_FRAME_INTERVAL_MS);
				});
			}

			// Grab the full frame at the midpoint. We schedule it concurrently
			// during the loop above in practice; simplified here by doing it
			// after since captureFullFrame is fast.
			full = captureFullFrame(
				video,
				canvas,
				`face-login-silent-full-${Date.now()}.jpg`,
			);

			if (thumbs.length < SILENT_FRAME_COUNT || !full) {
				finishFailure("INVALID_IMAGE", 0, "silent");
				return;
			}

			// Release the flag so uploadSilent can re-acquire it (the invariant
			// is "only one request in flight", not "only one capture").
			inFlightRef.current = false;
			await uploadSilent(thumbs, full, nonce);
		},
		[finishFailure, schedule, uploadSilent],
	);

	// -------- Nonce + kick off silent ---------------------------------------
	const requestNonceAndCapture = useCallback(async () => {
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		setPhase("requesting_nonce");
		setStatusMessage("Preparing…");

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const resp = await fetch("/api/auth/admin/faceid/nonce", {
				body: JSON.stringify({
					browserFingerprint: identity.browserFingerprint,
					browserLabel: identity.browserLabel,
					email,
				}),
				cache: "no-store",
				headers: { "content-type": "application/json" },
				method: "POST",
				signal: controller.signal,
			});
			const payload = await readApiPayload<{ nonce?: string; ttlSec?: number } & ApiError>(resp);
			telemetryRef.current.lastResp = {
				endpoint: "nonce",
				errorCode: payload?.errorCode,
				httpStatus: resp.status,
			};

			if (!resp.ok || !payload?.nonce) {
				// Nonce failure — browser not OTP-verified, etc. Show generic.
				finishFailure(payload?.errorCode, resp.status, "silent");
				return;
			}

			nonceRef.current = payload.nonce;
			// Release flag so runSilentCapture can re-enter cleanly.
			inFlightRef.current = false;
			await runSilentCapture(payload.nonce);
		} catch (err) {
			if ((err as Error)?.name === "AbortError") return;
			finishFailure(undefined, 0, "silent");
		}
	}, [email, finishFailure, identity.browserFingerprint, identity.browserLabel, runSilentCapture]);

	// -------- Gate loop (rAF) ----------------------------------------------
	// Only active while phase === "gating". All other phases are locked and
	// capture/upload own the video stream directly.
	useEffect(() => {
		if (phase !== "gating") {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			return;
		}

		if (firstGatingAtRef.current === null) {
			firstGatingAtRef.current = performance.now();
		}

		const tick = (ts: number) => {
			rafRef.current = requestAnimationFrame(tick);

			if (ts - lastAnalysisAtRef.current < ANALYSIS_INTERVAL_MS) return;
			lastAnalysisAtRef.current = ts;

			const video = videoRef.current;
			const landmarker = landmarkerRef.current;
			if (!video || !landmarker) return;
			if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
			// Don't run while an upload/nonce request is in flight.
			if (inFlightRef.current) return;

			const result = landmarker.detectForVideo(video, performance.now());
			const faces = result.faceLandmarks;

			const resetStability = (gate: GateReason) => {
				telemetryRef.current = {
					drift: 0,
					evalResult: null,
					gate,
					lastResp: telemetryRef.current.lastResp,
				};
				stabilityStartAtRef.current = null;
				stabilityCenterRef.current = null;
				maxDriftRef.current = 0;
				setStatusMessage(GATE_MESSAGE[gate]);
				if (debugOn) setDebugTick((n) => n + 1);
			};

			if (faces.length === 0) return resetStability("no-face");
			if (faces.length > 1) return resetStability("multi-face");

			const landmarks = faces[0] as Point2D[];
			lastLandmarksRef.current = landmarks;
			const evalResult = evaluateLandmarks(landmarks);
			if (!evalResult) return resetStability("missing-landmarks");

			if (evalResult.gate !== "ok") {
				telemetryRef.current = {
					drift: 0,
					evalResult,
					gate: evalResult.gate,
					lastResp: telemetryRef.current.lastResp,
				};
				stabilityStartAtRef.current = null;
				stabilityCenterRef.current = null;
				maxDriftRef.current = 0;
				setStatusMessage(GATE_MESSAGE[evalResult.gate]);
				if (debugOn) setDebugTick((n) => n + 1);
				return;
			}

			// All gates pass — run stability window.
			if (stabilityStartAtRef.current === null) {
				stabilityStartAtRef.current = ts;
				stabilityCenterRef.current = { x: evalResult.bbox.cx, y: evalResult.bbox.cy };
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
						lastResp: telemetryRef.current.lastResp,
					};
					stabilityStartAtRef.current = ts;
					stabilityCenterRef.current = { x: evalResult.bbox.cx, y: evalResult.bbox.cy };
					maxDriftRef.current = 0;
					setStatusMessage(GATE_MESSAGE.unstable);
					if (debugOn) setDebugTick((n) => n + 1);
					return;
				}
			}

			telemetryRef.current = {
				drift: maxDriftRef.current,
				evalResult,
				gate: "ok",
				lastResp: telemetryRef.current.lastResp,
			};
			setStatusMessage(GATE_MESSAGE.ok);
			if (debugOn) setDebugTick((n) => n + 1);

			// Window complete ⇒ kick off the silent flow. inFlightRef will be
			// set inside requestNonceAndCapture, so the rAF bailout above
			// stops running gates until we're back in "gating" (which only
			// happens on explicit Retry).
			if (
				ts - (stabilityStartAtRef.current ?? ts) >= FACE_STABILITY_MS
			) {
				void requestNonceAndCapture();
			}
		};

		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [debugOn, phase, requestNonceAndCapture]);

	// -------- Debug bbox / landmarks overlay --------------------------------
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
		const x = (bbox.cx - bbox.w / 2) * w;
		const y = (bbox.cy - bbox.h / 2) * h;
		ctx.strokeStyle =
			telemetryRef.current.gate === "ok" ? "#34d399" : "#f97316";
		ctx.lineWidth = 2;
		ctx.strokeRect(x, y, bbox.w * w, bbox.h * h);
		// Dots on the edge-check landmarks.
		const lms = lastLandmarksRef.current;
		if (lms) {
			ctx.fillStyle = "#fde68a";
			for (const idx of EDGE_CHECK_INDICES) {
				const p = lms[idx];
				if (!p) continue;
				ctx.beginPath();
				ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		// 5% safe-margin rectangle.
		ctx.strokeStyle = "#64748b";
		ctx.lineWidth = 1;
		ctx.strokeRect(
			w * FACE_EDGE_SAFE_MARGIN,
			h * FACE_EDGE_SAFE_MARGIN,
			w * (1 - 2 * FACE_EDGE_SAFE_MARGIN),
			h * (1 - 2 * FACE_EDGE_SAFE_MARGIN),
		);
	}, [debugOn, debugTick]);

	// -------- Retry — fully reset state back to gating ----------------------
	const handleRetry = useCallback(() => {
		abortRef.current?.abort();
		clearAllTimers();
		inFlightRef.current = false;
		stabilityStartAtRef.current = null;
		stabilityCenterRef.current = null;
		maxDriftRef.current = 0;
		firstGatingAtRef.current = performance.now();
		challengeConsumedRef.current = false;
		challengePromptRef.current = null;
		challengeNonceRef.current = null;
		nonceRef.current = null;
		setChallengePrompt(null);
		setPhase("gating");
		setStatusMessage("Looking for you…");
	}, [clearAllTimers]);

	const tele = telemetryRef.current;
	const canClose =
		phase !== "uploading_silent" &&
		phase !== "uploading_challenge" &&
		phase !== "requesting_nonce";

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
						onClick={onClose}
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
								className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
							/>
							<canvas ref={canvasRef} className="hidden" />
							{debugOn && (
								<canvas
									ref={debugCanvasRef}
									className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1]"
								/>
							)}
							<div
								className={`pointer-events-none absolute inset-0 rounded-[32px] border-2 transition-colors ${
									phase === "capturing_silent" ||
									phase === "capturing_challenge" ||
									phase === "uploading_silent" ||
									phase === "uploading_challenge" ||
									phase === "requesting_nonce"
										? "border-emerald-300/60"
										: phase === "success"
											? "border-emerald-400/80"
											: phase === "retry"
												? "border-rose-300/60"
												: "border-white/10"
								}`}
							/>

							{(phase === "challenge_prompt" ||
								phase === "capturing_challenge") &&
								challengePrompt && (
									<FaceChallengeOverlay prompt={challengePrompt} />
								)}
						</div>

						{(phase === "uploading_silent" ||
							phase === "uploading_challenge" ||
							phase === "requesting_nonce") && (
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
										<div>
											edge-dist(worst):{" "}
											{tele.evalResult.worstEdgeDist.toFixed(3)}
										</div>
										<div>drift: {tele.drift.toFixed(4)}</div>
									</>
								)}
								{tele.lastResp && (
									<div>
										last: {tele.lastResp.endpoint} {tele.lastResp.httpStatus}{" "}
										{tele.lastResp.status ?? ""}{" "}
										{tele.lastResp.errorCode ?? ""}
									</div>
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
									: phase === "retry"
										? "Couldn't verify you"
										: phase === "fatal"
											? "Camera unavailable"
											: phase === "uploading_silent" ||
												  phase === "uploading_challenge" ||
												  phase === "requesting_nonce"
												? "Verifying…"
												: phase === "challenge_prompt" ||
													  phase === "capturing_challenge"
													? "One more thing"
													: phase === "capturing_silent"
														? "Hold still…"
														: "Looking for you…"}
							</p>
							<p className="mt-2 text-sm text-white/60">{statusMessage}</p>
						</div>

						<div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
							{phase === "retry" ? (
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
								onClick={onClose}
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

// =====================================================================
// LoginCard — unchanged except: face-id overlay wiring uses new contract
// =====================================================================

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
		if (!cachedIdentity) return;
		setBrowserIdentity(cachedIdentity);
		setFingerprintStatus("ready");
	}, []);

	useEffect(() => {
		if (tab !== "admin") return;
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
				if (cancelled) return;
				setBrowserIdentity(identity);
				setFingerprintStatus("ready");
			} catch {
				if (cancelled) return;
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
		if (browserIdentity) return browserIdentity;
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
		if (otpCooldown <= 0) return;
		const timer = window.setTimeout(() => {
			setOtpCooldown((seconds) => seconds - 1);
		}, 1000);
		return () => window.clearTimeout(timer);
	}, [otpCooldown]);

	const getAdminEmailError = (value: string) => {
		const email = value.trim();
		if (!email) return "Enter your admin email first.";
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
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const payload = await readApiPayload<ApiError>(response);

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
				body: JSON.stringify({ email: adminId.trim() }),
				cache: "no-store",
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const payload = await readApiPayload<ApiError>(response);
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
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const payload = await readApiPayload<ApiError>(response);
		if (!response.ok) {
			throw new Error(getApiErrorMessage(payload, "Unable to sign in."));
		}
		router.push(payload?.nextPage || "/admin/dashboard");
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
				getFaceIdBrowserNotice("BROWSER_FINGERPRINT_REQUIRED"),
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
			{isFaceIdOverlayOpen && browserIdentity && (
				<FaceIdLoginOverlay
					email={adminId.trim()}
					identity={browserIdentity}
					onClose={() => setIsFaceIdOverlayOpen(false)}
					onSuccess={(nextPage) => {
						setIsFaceIdOverlayOpen(false);
						router.push(nextPage);
					}}
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
										disabled={isSubmitting}
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
										disabled={isSubmitting}
										className="w-full rounded-lg border-none bg-surface-container-highest py-3 pl-12 pr-12 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary/40"
									/>
									<button
										type="button"
										onClick={() => setShowPassword((v) => !v)}
										disabled={isSubmitting}
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
										disabled={isSubmitting || isSendingOtp}
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
										disabled={isSubmitting}
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
								disabled={isSubmitting || isSendingOtp}
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
						disabled={isSubmitting}
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
									isSendingOtp
								}
								className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-indigo-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<span className="material-symbols-outlined text-[20px] text-indigo-500">
									face_retouching_natural
								</span>
								Sign in with Face ID
							</button>

							<p className="text-center text-xs text-slate-400">
								{fingerprintStatus === "failed"
									? "Face ID is unavailable because this browser could not be identified. Use OTP instead."
									: fingerprintStatus === "loading"
										? "Checking browser identity before Face ID login."
										: canUseFaceId
											? "Enter your admin email, then look at the camera — sign-in is automatic."
											: "Nhap email admin hop le truoc khi dang nhap bang Face ID."}
							</p>
						</>
					)}
				</form>
			</div>
		</>
	);
}
