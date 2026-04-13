"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker as MediaPipeFaceLandmarker } from "@mediapipe/tasks-vision";
import {
	getCachedBrowserIdentity,
	getBrowserIdentity,
	type BrowserFingerprintStatus,
	type BrowserIdentity,
} from "@/app/lib/browser-fingerprint";
import {
	FACE_ID_ENROLL_STEPS,
	type FaceIdStepId,
	mapFaceIdErrorMessage,
} from "@/app/lib/face-id";
import {
	captureVisibleVideoFrame,
	dataUrlToFile,
} from "@/app/lib/face-id-camera";
import SectionCard from "@/app/ui/settings/section-card";
import SettingRow from "@/app/ui/settings/setting-row";
import Toggle from "@/app/ui/settings/toggle";

type StatusResponse = {
	data?: {
		hasFaceProfile?: unknown;
		currentBrowser?: {
			browserLabel?: unknown;
			canUseFaceIdLogin?: unknown;
			faceIdEnabled?: unknown;
			fingerprintProvided?: unknown;
			hasOtpVerifiedBrowser?: unknown;
		};
	};
};

type ApiPayload = {
	error?: string;
	errorCode?: string;
	errors?: string[];
	message?: string | string[];
} & StatusResponse;

type FaceCaptureMap = Record<FaceIdStepId, File | null>;
type EnrollmentPhase =
	| "idle"
	| "requesting_camera"
	| "capturing"
	| "submitting"
	| "success"
	| "error";

type CurrentBrowserFaceIdStatus = {
	browserLabel: string;
	canUseFaceIdLogin: boolean;
	faceIdEnabled: boolean;
	fingerprintProvided: boolean;
	hasOtpVerifiedBrowser: boolean;
};

const FACE_CAPTURE_VIEWPORT = {
	height: 770,
	width: 640,
} as const;
const FACE_ANALYSIS_INTERVAL_MS = 90;
const FACE_HOLD_DURATION_MS = 400;
const FACE_MIN_WIDTH = 0.2;
const FACE_MIN_HEIGHT = 0.28;
const FACE_MAX_WIDTH = 0.76;
const FACE_MAX_HEIGHT = 0.9;
const FACE_CENTER_X_TOLERANCE = 0.16;
const FACE_CENTER_Y_TOLERANCE = 0.2;
const FRONT_YAW_TOLERANCE = 0.05;
const FRONT_PITCH_TOLERANCE = 0.045;
const SIDE_YAW_TARGET = 0.045;
const UP_PITCH_TARGET = 0.032;
const DOWN_PITCH_TARGET = 0.038;
const MEDIAPIPE_WASM_ROOT =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const FACE_LANDMARKER_MODEL_ASSET =
	"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Point2D = {
	x: number;
	y: number;
};

type PoseMetrics = {
	faceHeight: number;
	faceWidth: number;
	pitch: number;
	yaw: number;
};

type FaceAnalysis = {
	holdReady: boolean;
	message: string;
	metrics: PoseMetrics;
};

const FACE_INDICES = {
	chin: 152,
	forehead: 10,
	leftCheek: 234,
	leftEyeInner: 133,
	leftEyeOuter: 33,
	mouthLeft: 61,
	mouthRight: 291,
	noseTip: 1,
	rightCheek: 454,
	rightEyeInner: 362,
	rightEyeOuter: 263,
} as const;

function averagePoints(...points: Array<Point2D | undefined>) {
	const valid = points.filter(Boolean) as Point2D[];

	if (valid.length === 0) {
		return null;
	}

	return {
		x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
		y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length,
	};
}

function getPoint(landmarks: Point2D[], index: number) {
	return landmarks[index];
}

function getPoseMetrics(landmarks: Point2D[]): PoseMetrics | null {
	const leftEye = averagePoints(
		getPoint(landmarks, FACE_INDICES.leftEyeOuter),
		getPoint(landmarks, FACE_INDICES.leftEyeInner),
	);
	const rightEye = averagePoints(
		getPoint(landmarks, FACE_INDICES.rightEyeOuter),
		getPoint(landmarks, FACE_INDICES.rightEyeInner),
	);
	const noseTip = getPoint(landmarks, FACE_INDICES.noseTip);
	const forehead = getPoint(landmarks, FACE_INDICES.forehead);
	const chin = getPoint(landmarks, FACE_INDICES.chin);
	const mouth = averagePoints(
		getPoint(landmarks, FACE_INDICES.mouthLeft),
		getPoint(landmarks, FACE_INDICES.mouthRight),
	);

	if (!leftEye || !rightEye || !noseTip || !forehead || !chin || !mouth) {
		return null;
	}

	const eyeMid = averagePoints(leftEye, rightEye);

	if (!eyeMid) {
		return null;
	}

	const faceWidth = Math.abs(rightEye.x - leftEye.x);
	const faceHeight = Math.max(chin.y - forehead.y, 0.001);
	const yaw = (noseTip.x - eyeMid.x) / Math.max(faceWidth, 0.001);
	const pitch =
		(mouth.y - noseTip.y - (noseTip.y - eyeMid.y)) /
		Math.max(faceHeight, 0.001);

	return {
		faceHeight,
		faceWidth,
		pitch,
		yaw,
	};
}

function analyzeCurrentFace(
	landmarks: Point2D[],
	stepId: FaceIdStepId,
): FaceAnalysis {
	const forehead = getPoint(landmarks, FACE_INDICES.forehead);
	const chin = getPoint(landmarks, FACE_INDICES.chin);
	const leftCheek = getPoint(landmarks, FACE_INDICES.leftCheek);
	const rightCheek = getPoint(landmarks, FACE_INDICES.rightCheek);
	const metrics = getPoseMetrics(landmarks);

	if (!forehead || !chin || !leftCheek || !rightCheek || !metrics) {
		return {
			holdReady: false,
			message: "Keep your full face inside the frame.",
			metrics: {
				faceHeight: 0,
				faceWidth: 0,
				pitch: 0,
				yaw: 0,
			},
		};
	}

	const centerX = (leftCheek.x + rightCheek.x) / 2;
	const centerY = (forehead.y + chin.y) / 2;
	const width = rightCheek.x - leftCheek.x;
	const height = chin.y - forehead.y;

	if (width < FACE_MIN_WIDTH || height < FACE_MIN_HEIGHT) {
		return {
			holdReady: false,
			message: "Move a little closer.",
			metrics,
		};
	}

	if (width > FACE_MAX_WIDTH || height > FACE_MAX_HEIGHT) {
		return {
			holdReady: false,
			message: "Move a little farther back.",
			metrics,
		};
	}

	if (
		Math.abs(centerX - 0.5) > FACE_CENTER_X_TOLERANCE ||
		Math.abs(centerY - 0.5) > FACE_CENTER_Y_TOLERANCE
	) {
		return {
			holdReady: false,
			message: "Center your face in the frame.",
			metrics,
		};
	}

	switch (stepId) {
		case "front":
			if (
				Math.abs(metrics.yaw) <= FRONT_YAW_TOLERANCE &&
				Math.abs(metrics.pitch) <= FRONT_PITCH_TOLERANCE
			) {
				return {
					holdReady: true,
					message: "Hold still.",
					metrics,
				};
			}
			if (Math.abs(metrics.yaw) > FRONT_YAW_TOLERANCE) {
				return {
					holdReady: false,
					message:
						metrics.yaw > 0
							? "Turn slightly to the left."
							: "Turn slightly to the right.",
					metrics,
				};
			}
			return {
				holdReady: false,
				message:
					metrics.pitch > 0
						? "Lower your chin a little."
						: "Raise your chin a little.",
				metrics,
			};
		case "left":
			return metrics.yaw >= SIDE_YAW_TARGET
				? {
						holdReady: true,
						message: "Hold still.",
						metrics,
					}
				: {
						holdReady: false,
						message: "Turn slightly to the left.",
						metrics,
					};
		case "right":
			return metrics.yaw <= -SIDE_YAW_TARGET
				? {
						holdReady: true,
						message: "Hold still.",
						metrics,
					}
				: {
						holdReady: false,
						message: "Turn slightly to the right.",
						metrics,
					};
		case "up":
			return metrics.pitch >= UP_PITCH_TARGET
				? {
						holdReady: true,
						message: "Hold still.",
						metrics,
					}
				: {
						holdReady: false,
						message: "Raise your chin a little.",
						metrics,
					};
		case "down":
			return metrics.pitch <= -DOWN_PITCH_TARGET
				? {
						holdReady: true,
						message: "Hold still.",
						metrics,
					}
				: {
						holdReady: false,
						message: "Lower your chin a little.",
						metrics,
					};
		default:
			return {
				holdReady: false,
				message: "Align your face in the frame.",
				metrics,
			};
	}
}

function createEmptyCaptures(): FaceCaptureMap {
	return {
		down: null,
		front: null,
		left: null,
		right: null,
		up: null,
	};
}

async function readApiPayload(response: Response) {
	try {
		return (await response.json()) as ApiPayload;
	} catch {
		return null;
	}
}

function getErrorMessage(payload: ApiPayload | null, fallback: string) {
	if (!payload) {
		return fallback;
	}

	if (payload.errorCode) {
		return mapFaceIdErrorMessage(payload.errorCode, fallback);
	}

	if (typeof payload.message === "string" && payload.message.trim()) {
		return payload.message;
	}

	if (Array.isArray(payload.message) && payload.message.length > 0) {
		return payload.message.join(", ");
	}

	if (typeof payload.error === "string" && payload.error.trim()) {
		return payload.error;
	}

	if (Array.isArray(payload.errors) && payload.errors.length > 0) {
		return payload.errors.join(", ");
	}

	return fallback;
}

function getDefaultCurrentBrowserStatus(): CurrentBrowserFaceIdStatus {
	return {
		browserLabel: "",
		canUseFaceIdLogin: false,
		faceIdEnabled: false,
		fingerprintProvided: false,
		hasOtpVerifiedBrowser: false,
	};
}

function normalizeCurrentBrowserStatus(
	value: StatusResponse["data"] extends { currentBrowser?: infer T }
		? T
		: unknown,
): CurrentBrowserFaceIdStatus {
	if (!value || typeof value !== "object") {
		return getDefaultCurrentBrowserStatus();
	}

	const record = value as {
		browserLabel?: unknown;
		canUseFaceIdLogin?: unknown;
		faceIdEnabled?: unknown;
		fingerprintProvided?: unknown;
		hasOtpVerifiedBrowser?: unknown;
	};

	return {
		browserLabel:
			typeof record.browserLabel === "string" ? record.browserLabel : "",
		canUseFaceIdLogin: record.canUseFaceIdLogin === true,
		faceIdEnabled: record.faceIdEnabled === true,
		fingerprintProvided: record.fingerprintProvided === true,
		hasOtpVerifiedBrowser: record.hasOtpVerifiedBrowser === true,
	};
}

function FaceEnrollmentOverlay({
	onCancel,
	onComplete,
}: {
	onCancel: () => void;
	onComplete: (result: { ok: boolean; message: string }) => Promise<void>;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const landmarkerRef = useRef<MediaPipeFaceLandmarker | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const lastAnalysisAtRef = useRef(0);
	const holdStartedAtRef = useRef<number | null>(null);
	const isBusyRef = useRef(false);
	const [phase, setPhase] = useState<EnrollmentPhase>("requesting_camera");
	const [captures, setCaptures] = useState<FaceCaptureMap>(() =>
		createEmptyCaptures(),
	);
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [statusMessage, setStatusMessage] = useState(
		"Requesting access to your camera...",
	);
	const [holdProgress, setHoldProgress] = useState(0);
	const [detectorMessage, setDetectorMessage] = useState(
		"Loading face guidance...",
	);

	const currentStep = FACE_ID_ENROLL_STEPS[currentStepIndex];

	useEffect(() => {
		let cancelled = false;

		async function setupEnrollment() {
			try {
				setStatusMessage("Requesting access to your camera...");
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						facingMode: "user",
						height: { ideal: 720 },
						width: { ideal: 1280 },
					},
				});

				if (cancelled) {
					for (const track of stream.getTracks()) {
						track.stop();
					}
					return;
				}

				streamRef.current = stream;

				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}

				setStatusMessage("Loading face guidance...");
				const vision = await import("@mediapipe/tasks-vision");

				if (cancelled) {
					return;
				}

				const wasmFileset =
					await vision.FilesetResolver.forVisionTasks(
						MEDIAPIPE_WASM_ROOT,
					);

				if (cancelled) {
					return;
				}

				const landmarker =
					await vision.FaceLandmarker.createFromOptions(wasmFileset, {
						baseOptions: {
							modelAssetPath: FACE_LANDMARKER_MODEL_ASSET,
						},
						minFaceDetectionConfidence: 0.6,
						minFacePresenceConfidence: 0.6,
						minTrackingConfidence: 0.6,
						numFaces: 1,
						outputFacialTransformationMatrixes: false,
						runningMode: "VIDEO",
					});

				if (cancelled) {
					landmarker.close();
					return;
				}

				landmarkerRef.current = landmarker;
				setPhase("capturing");
				setStatusMessage("Align your face inside the frame.");
				setDetectorMessage(FACE_ID_ENROLL_STEPS[0].hint);
			} catch {
				setPhase("error");
				setStatusMessage(
					"Camera or face guidance could not be started on this device.",
				);
			}
		}

		void setupEnrollment();

		return () => {
			cancelled = true;
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
			landmarkerRef.current?.close();
			landmarkerRef.current = null;
			const stream = streamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			}
		};
	}, []);

	const captureCurrentStep = useCallback(async () => {
		if (
			!videoRef.current ||
			!canvasRef.current ||
			!currentStep ||
			isBusyRef.current
		) {
			return;
		}

		isBusyRef.current = true;
		setHoldProgress(0);
		holdStartedAtRef.current = null;

		try {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			const dataUrl = captureVisibleVideoFrame(
				video,
				canvas,
				FACE_CAPTURE_VIEWPORT,
			);
			const file = dataUrlToFile(
				dataUrl,
				`face-${currentStep.id}-${Date.now()}.jpg`,
			);

			if (!file) {
				throw new Error("Unable to capture the current frame.");
			}

			setCaptures((current) => ({
				...current,
				[currentStep.id]: file,
			}));

			if (currentStepIndex < FACE_ID_ENROLL_STEPS.length - 1) {
				const nextIndex = currentStepIndex + 1;
				setCurrentStepIndex(nextIndex);
				setStatusMessage("Align your face inside the frame.");
				setDetectorMessage(FACE_ID_ENROLL_STEPS[nextIndex].hint);
				return;
			}

			setPhase("submitting");
			setStatusMessage("Checking and saving your face profile...");

			const formData = new FormData();
			const updatedCaptures = {
				...captures,
				[currentStep.id]: file,
			};

			for (const step of FACE_ID_ENROLL_STEPS) {
				const capturedFile = updatedCaptures[step.id];

				if (!capturedFile) {
					throw new Error("Missing one or more captured angles.");
				}

				formData.append("images", capturedFile);
			}

			const response = await fetch("/api/admin/faceid/enroll", {
				body: formData,
				method: "POST",
			});
			const payload = await readApiPayload(response);

			if (!response.ok) {
				throw new Error(
					getErrorMessage(payload, "Oh no, your face was not saved."),
				);
			}

			const message =
				typeof payload?.message === "string" && payload.message.trim()
					? payload.message
					: "Ok saved.";

			setPhase("success");
			setStatusMessage(message);
			await onComplete({ message, ok: true });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Oh no, your face was not saved.";
			setPhase("error");
			setStatusMessage(message);
			await onComplete({ message, ok: false });
		} finally {
			isBusyRef.current = false;
		}
	}, [captures, currentStep, currentStepIndex, onComplete]);

	useEffect(() => {
		if (
			phase !== "capturing" ||
			!currentStep ||
			!videoRef.current ||
			!landmarkerRef.current
		) {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
			holdStartedAtRef.current = null;
			setHoldProgress(0);
			return;
		}

		const tick = (timestamp: number) => {
			animationFrameRef.current = requestAnimationFrame(tick);

			if (
				timestamp - lastAnalysisAtRef.current <
				FACE_ANALYSIS_INTERVAL_MS
			) {
				return;
			}

			lastAnalysisAtRef.current = timestamp;

			if (
				!videoRef.current ||
				!landmarkerRef.current ||
				isBusyRef.current
			) {
				return;
			}

			if (
				videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
			) {
				return;
			}

			const result = landmarkerRef.current.detectForVideo(
				videoRef.current,
				performance.now(),
			);
			const landmarks = result.faceLandmarks[0] as Point2D[] | undefined;

			if (!landmarks || result.faceLandmarks.length !== 1) {
				holdStartedAtRef.current = null;
				setHoldProgress(0);
				setDetectorMessage(
					result.faceLandmarks.length > 1
						? "Keep only one face in frame."
						: "Place your face in the frame.",
				);
				return;
			}

			const analysis = analyzeCurrentFace(landmarks, currentStep.id);
			setDetectorMessage(analysis.message);

			if (!analysis.holdReady) {
				holdStartedAtRef.current = null;
				setHoldProgress(0);
				return;
			}

			if (holdStartedAtRef.current === null) {
				holdStartedAtRef.current = timestamp;
			}

			const progress = Math.min(
				(timestamp - holdStartedAtRef.current) / FACE_HOLD_DURATION_MS,
				1,
			);
			setHoldProgress(progress);

			if (progress >= 1) {
				if (animationFrameRef.current !== null) {
					cancelAnimationFrame(animationFrameRef.current);
					animationFrameRef.current = null;
				}
				void captureCurrentStep();
			}
		};

		animationFrameRef.current = requestAnimationFrame(tick);

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [captureCurrentStep, currentStep, phase]);

	const retryFromStart = async () => {
		setCaptures(createEmptyCaptures());
		setCurrentStepIndex(0);
		setPhase(streamRef.current ? "capturing" : "requesting_camera");
		holdStartedAtRef.current = null;
		setHoldProgress(0);
		setStatusMessage("Align your face inside the frame.");
		setDetectorMessage(FACE_ID_ENROLL_STEPS[0].hint);
	};

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-6">
			<div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl ring-1 ring-white/10">
				<div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
					<div>
						<h3 className="text-lg font-bold">
							Face ID Enrollment
						</h3>
						<p className="mt-1 text-sm text-white/55">
							Keep only one face in frame and follow the guided
							angles.
						</p>
					</div>
					<button
						type="button"
						onClick={onCancel}
						disabled={phase === "submitting"}
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

							<div className="pointer-events-none absolute inset-0 border border-white/10" />
							<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
								<div className="relative h-[62%] w-[58%] rounded-[999px] border-2 border-cyan-300/85 shadow-[0_0_0_1px_rgba(103,232,249,0.15),0_0_18px_rgba(34,211,238,0.14)]">
									<div className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-cyan-200/75" />
									<div className="absolute bottom-0 left-1/2 h-5 w-px -translate-x-1/2 translate-y-1/2 bg-cyan-200/75" />
									<div className="absolute left-0 top-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 bg-cyan-200/75" />
									<div className="absolute right-0 top-1/2 h-px w-5 translate-x-1/2 -translate-y-1/2 bg-cyan-200/75" />
								</div>
							</div>
						</div>

						{phase === "submitting" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/70">
								<div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-cyan-300" />
								<p className="text-sm font-semibold">
									Checking and saving your face profile...
								</p>
							</div>
						)}

						{phase === "success" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-emerald-950/65">
								<span className="material-symbols-outlined text-7xl text-emerald-300">
									check_circle
								</span>
								<p className="text-lg font-bold">Ok saved</p>
								<p className="max-w-sm text-center text-sm text-emerald-100/85">
									{statusMessage}
								</p>
							</div>
						)}

						{phase === "error" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-red-950/65 px-6 text-center">
								<span className="material-symbols-outlined text-7xl text-red-300">
									error
								</span>
								<p className="text-lg font-bold">
									Oh no, your face is not saved
								</p>
								<p className="max-w-sm text-sm text-red-100/85">
									{statusMessage}
								</p>
								<div className="flex gap-3">
									<button
										type="button"
										onClick={() => void retryFromStart()}
										className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
									>
										Try Again
									</button>
									<button
										type="button"
										onClick={onCancel}
										className="rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
									>
										Close
									</button>
								</div>
							</div>
						)}
					</div>

					<div className="bg-slate-900 px-6 py-6">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<p className="text-sm font-semibold">
								{currentStep?.label ?? "Ready"}
							</p>
							<p className="mt-2 text-sm text-white/60">
								{phase === "capturing"
									? detectorMessage
									: currentStep?.hint ??
										"Your five angles are ready to be verified."}
							</p>
							<div className="mt-4 space-y-2">
								<div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
									<span>Auto Capture</span>
									<span>{Math.round(holdProgress * 100)}%</span>
								</div>
								<div className="h-3 overflow-hidden rounded-full bg-white/10">
									<div
										className="h-full rounded-full bg-cyan-300 transition-[width] duration-100"
										style={{
											width: `${holdProgress * 100}%`,
										}}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function FaceIdSection({}: Record<string, never>) {
	const [hasFaceProfile, setHasFaceProfile] = useState(false);
	const [isLoadingStatus, setIsLoadingStatus] = useState(true);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isUpdatingBrowserAccess, setIsUpdatingBrowserAccess] =
		useState(false);
	const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
	const [fingerprintStatus, setFingerprintStatus] =
		useState<BrowserFingerprintStatus>("idle");
	const [browserIdentity, setBrowserIdentity] =
		useState<BrowserIdentity | null>(null);
	const browserIdentityRef = useRef<BrowserIdentity | null>(null);
	const [currentBrowser, setCurrentBrowser] =
		useState<CurrentBrowserFaceIdStatus>(getDefaultCurrentBrowserStatus);
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");

	const refreshStatus = useCallback(
		async (identity?: BrowserIdentity | null) => {
			setIsLoadingStatus(true);

			try {
				const resolvedIdentity = identity ?? browserIdentityRef.current;
				const response = await fetch("/api/admin/faceid/status", {
					cache: "no-store",
					headers: resolvedIdentity?.browserFingerprint
						? {
								"x-browser-fingerprint":
									resolvedIdentity.browserFingerprint,
							}
						: undefined,
				});
				const payload = await readApiPayload(response);

				if (!response.ok) {
					throw new Error(
						getErrorMessage(
							payload,
							"Unable to load Face ID status.",
						),
					);
				}

				setHasFaceProfile(
					Boolean(
						payload?.data && payload.data.hasFaceProfile === true,
					),
				);
				setCurrentBrowser(
					normalizeCurrentBrowserStatus(
						payload?.data?.currentBrowser,
					),
				);
			} catch (error) {
				setErrorMessage(
					error instanceof Error
						? error.message
						: "Unable to load Face ID status.",
				);
			} finally {
				setIsLoadingStatus(false);
			}
		},
		[],
	);

	useEffect(() => {
		const cachedIdentity = getCachedBrowserIdentity();

		if (!cachedIdentity) {
			return;
		}

		browserIdentityRef.current = cachedIdentity;
		setBrowserIdentity(cachedIdentity);
		setFingerprintStatus("ready");
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function loadStatus() {
			setFingerprintStatus("loading");

			try {
				const identity = await getBrowserIdentity();

				if (cancelled) {
					return;
				}

				browserIdentityRef.current = identity;
				setBrowserIdentity(identity);
				setFingerprintStatus("ready");
				await refreshStatus(identity);
			} catch {
				if (cancelled) {
					return;
				}

				browserIdentityRef.current = null;
				setBrowserIdentity(null);
				setFingerprintStatus("failed");
				await refreshStatus(null);
			}
		}

		void loadStatus();

		return () => {
			cancelled = true;
		};
	}, [refreshStatus]);

	const handleDelete = async () => {
		setErrorMessage("");
		setSuccessMessage("");
		setIsDeleting(true);

		try {
			const response = await fetch("/api/admin/faceid/profile", {
				method: "DELETE",
			});
			const payload = await readApiPayload(response);

			if (!response.ok) {
				throw new Error(
					getErrorMessage(
						payload,
						"Unable to delete Face ID profile.",
					),
				);
			}

			setSuccessMessage(
				typeof payload?.message === "string" && payload.message.trim()
					? payload.message
					: "Face ID profile deleted.",
			);
			await refreshStatus(browserIdentity);
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to delete Face ID profile.",
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleBrowserAccessChange = async (nextEnabled: boolean) => {
		if (!browserIdentity) {
			return;
		}

		setErrorMessage("");
		setSuccessMessage("");
		setIsUpdatingBrowserAccess(true);

		try {
			const response = await fetch("/api/admin/faceid/browser-access", {
				body: JSON.stringify({
					browserFingerprint: browserIdentity.browserFingerprint,
					browserLabel: browserIdentity.browserLabel,
					enabled: nextEnabled,
				}),
				headers: {
					"Content-Type": "application/json",
				},
				method: "PATCH",
			});
			const payload = await readApiPayload(response);

			if (!response.ok) {
				throw new Error(
					getErrorMessage(
						payload,
						nextEnabled
							? "Unable to enable Face ID for this browser."
							: "Unable to disable Face ID for this browser.",
					),
				);
			}

			setSuccessMessage(
				nextEnabled
					? "Face ID is enabled for this browser."
					: "Face ID is disabled for this browser.",
			);
			await refreshStatus(browserIdentity);
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to update Face ID browser access.",
			);
		} finally {
			setIsUpdatingBrowserAccess(false);
		}
	};

	const browserBlockMessage =
		fingerprintStatus === "failed"
			? "Khong the xac dinh browser hien tai. Face ID cho browser nay hien chua kha dung."
			: !hasFaceProfile
				? "FaceID is not registered."
				: currentBrowser.faceIdEnabled
					? "This browser can use FaceID"
					: "Enable login with FaceID for this browser";

	const browserBlockTone =
		fingerprintStatus === "failed"
			? "border-amber-200 bg-amber-50 text-amber-800"
			: hasFaceProfile && currentBrowser.faceIdEnabled
				? "border-emerald-200 bg-emerald-50 text-emerald-700"
				: "border-slate-200 bg-slate-50 text-slate-700";

	const browserToggleDisabled =
		fingerprintStatus !== "ready" ||
		!hasFaceProfile ||
		isUpdatingBrowserAccess;

	return (
		<>
			{isEnrollmentOpen && (
				<FaceEnrollmentOverlay
					onCancel={() => setIsEnrollmentOpen(false)}
					onComplete={async ({ ok, message }) => {
						if (ok) {
							setSuccessMessage(
								"Dang ky Face ID thanh cong. Ban co the bat Face ID cho browser nay.",
							);
							setErrorMessage("");
							await refreshStatus(browserIdentity);
							window.setTimeout(() => {
								setIsEnrollmentOpen(false);
							}, 1200);
							return;
						}

						setSuccessMessage("");
						setErrorMessage(message);
					}}
				/>
			)}

			<SectionCard
				icon="face_retouching_natural"
				title="Face ID Authentication"
				description="Enroll your face profile, then enable Face ID only for the browser you are using now."
			>
				<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-semibold text-slate-900">
								Current profile
							</p>
							<p className="mt-1 text-sm text-slate-500">
								{isLoadingStatus
									? "Checking Face ID status..."
									: hasFaceProfile
										? "Face ID is already enrolled for this admin."
										: "No Face ID profile has been enrolled yet."}
							</p>
						</div>
						<span
							className={`rounded-full px-3 py-1 text-xs font-bold ${hasFaceProfile ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
						>
							{hasFaceProfile ? "Enrolled" : "Not enrolled"}
						</span>
					</div>
				</div>

				<div className={`rounded-xl border p-4 ${browserBlockTone}`}>
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div className="space-y-1">
							<p className="text-sm font-semibold">
								Face ID for this browser
							</p>
							<p className="text-xs opacity-80">
								{fingerprintStatus === "loading"
									? "Dang xac dinh browser hien tai..."
									: currentBrowser.browserLabel ||
										browserIdentity?.browserLabel ||
										"Current browser"}
							</p>
							<p className="text-sm">{browserBlockMessage}</p>
							{hasFaceProfile &&
								!currentBrowser.faceIdEnabled && (
									<p className="text-xs opacity-80">
										Toggle this on to allow Face ID login on
										the current browser only.
									</p>
								)}
						</div>

						{fingerprintStatus === "ready" && (
							<div className="shrink-0">
								<SettingRow
									label="Enable login with FaceID for this browser"
									hint={
										browserToggleDisabled
											? undefined
											: currentBrowser.canUseFaceIdLogin
												? ""
												: "Enable FaceID for current browser"
									}
								>
									<Toggle
										checked={currentBrowser.faceIdEnabled}
										disabled={browserToggleDisabled}
										onChange={(value) => {
											void handleBrowserAccessChange(
												value,
											);
										}}
									/>
								</SettingRow>
							</div>
						)}
					</div>
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

				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => {
							setErrorMessage("");
							setSuccessMessage("");
							setIsEnrollmentOpen(true);
						}}
						className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
					>
						<span className="material-symbols-outlined text-[18px]">
							videocam
						</span>
						Enroll Face ID
					</button>

					{hasFaceProfile && (
						<button
							type="button"
							onClick={() => void handleDelete()}
							disabled={isDeleting}
							className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<span className="material-symbols-outlined text-[18px]">
								delete
							</span>
							{isDeleting ? "Deleting..." : "Delete Face ID"}
						</button>
					)}
				</div>

				<p className="text-xs text-slate-500">
					Enrollment and browser access are separate steps. After
					enrollment, you can enable Face ID for the current browser
					immediately.
				</p>
			</SectionCard>
		</>
	);
}
