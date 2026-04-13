"use client";

import { useRouter } from "next/navigation";
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
import {
	captureVisibleVideoFrame,
	dataUrlToFile,
} from "@/app/lib/face-id-camera";

const FACE_CAPTURE_VIEWPORT = {
	height: 770,
	width: 640,
} as const;
const FACE_ANALYSIS_INTERVAL_MS = 90;
const FACE_LOGIN_HOLD_DURATION_MS = 450;
const FACE_LOGIN_MIN_WIDTH = 0.22;
const FACE_LOGIN_MIN_HEIGHT = 0.32;
const FACE_LOGIN_MAX_WIDTH = 0.74;
const FACE_LOGIN_MAX_HEIGHT = 0.88;
const FACE_LOGIN_CENTER_X_TOLERANCE = 0.14;
const FACE_LOGIN_CENTER_Y_TOLERANCE = 0.17;
const FACE_LOGIN_YAW_TOLERANCE = 0.045;
const FACE_LOGIN_PITCH_TOLERANCE = 0.04;
const MEDIAPIPE_WASM_ROOT =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const FACE_LANDMARKER_MODEL_ASSET =
	"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Point2D = {
	x: number;
	y: number;
};

type FaceLoginAnalysis = {
	holdReady: boolean;
	message: string;
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

function analyzeLoginFace(landmarks: Point2D[]): FaceLoginAnalysis {
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
	const leftCheek = getPoint(landmarks, FACE_INDICES.leftCheek);
	const rightCheek = getPoint(landmarks, FACE_INDICES.rightCheek);

	if (
		!leftEye ||
		!rightEye ||
		!noseTip ||
		!forehead ||
		!chin ||
		!mouth ||
		!leftCheek ||
		!rightCheek
	) {
		return {
			holdReady: false,
			message: "Keep your full face inside the frame.",
		};
	}

	const eyeMid = averagePoints(leftEye, rightEye);

	if (!eyeMid) {
		return {
			holdReady: false,
			message: "Look straight at the camera.",
		};
	}

	const centerX = (leftCheek.x + rightCheek.x) / 2;
	const centerY = (forehead.y + chin.y) / 2;
	const faceWidth = rightCheek.x - leftCheek.x;
	const faceHeight = chin.y - forehead.y;

	if (faceWidth < FACE_LOGIN_MIN_WIDTH || faceHeight < FACE_LOGIN_MIN_HEIGHT) {
		return {
			holdReady: false,
			message: "Move a little closer.",
		};
	}

	if (faceWidth > FACE_LOGIN_MAX_WIDTH || faceHeight > FACE_LOGIN_MAX_HEIGHT) {
		return {
			holdReady: false,
			message: "Move a little farther back.",
		};
	}

	if (
		Math.abs(centerX - 0.5) > FACE_LOGIN_CENTER_X_TOLERANCE ||
		Math.abs(centerY - 0.5) > FACE_LOGIN_CENTER_Y_TOLERANCE
	) {
		return {
			holdReady: false,
			message: "Center your face in the frame.",
		};
	}

	const yaw = (noseTip.x - eyeMid.x) / Math.max(Math.abs(rightEye.x - leftEye.x), 0.001);
	const pitch =
		(mouth.y - noseTip.y - (noseTip.y - eyeMid.y)) /
		Math.max(chin.y - forehead.y, 0.001);

	if (Math.abs(yaw) > FACE_LOGIN_YAW_TOLERANCE) {
		return {
			holdReady: false,
			message:
				yaw > 0
					? "Turn slightly to the left."
					: "Turn slightly to the right.",
		};
	}

	if (Math.abs(pitch) > FACE_LOGIN_PITCH_TOLERANCE) {
		return {
			holdReady: false,
			message:
				pitch > 0
					? "Lower your chin a little."
					: "Raise your chin a little.",
		};
	}

	return {
		holdReady: true,
		message: "Hold still.",
	};
}

type Tab = "student" | "admin";
type FaceIdLoginPhase =
	| "requesting_camera"
	| "capturing"
	| "submitting"
	| "error";

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
	isSubmitting,
	onCancel,
	onSubmit,
}: {
	email: string;
	isSubmitting: boolean;
	onCancel: () => void;
	onSubmit: (file: File) => Promise<void>;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const landmarkerRef = useRef<MediaPipeFaceLandmarker | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const lastAnalysisAtRef = useRef(0);
	const holdStartedAtRef = useRef<number | null>(null);
	const isCapturingRef = useRef(false);
	const [phase, setPhase] = useState<FaceIdLoginPhase>("requesting_camera");
	const [statusMessage, setStatusMessage] = useState(
		"Requesting access to your camera...",
	);
	const [holdProgress, setHoldProgress] = useState(0);

	useEffect(() => {
		let cancelled = false;

		async function setupCamera() {
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
				setStatusMessage("Look straight at the camera and hold still.");
			} catch {
				setPhase("error");
				setStatusMessage(
					"Camera access is required to sign in with Face ID on this browser.",
				);
			}
		}

		void setupCamera();

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

	const handleCapture = useCallback(async () => {
		if (
			!videoRef.current ||
			!canvasRef.current ||
			isSubmitting ||
			isCapturingRef.current
		) {
			return;
		}

		try {
			isCapturingRef.current = true;
			setPhase("submitting");
			setStatusMessage("Verifying Face ID...");
			setHoldProgress(0);
			holdStartedAtRef.current = null;
			const dataUrl = captureVisibleVideoFrame(
				videoRef.current,
				canvasRef.current,
				FACE_CAPTURE_VIEWPORT,
			);
			const file = dataUrlToFile(dataUrl, `face-login-${Date.now()}.jpg`);

			if (!file) {
				throw new Error("Unable to capture the current frame.");
			}

			await onSubmit(file);
		} catch (error) {
			setPhase("error");
			setStatusMessage(
				error instanceof Error
					? error.message
					: "Unable to capture the current frame.",
			);
		} finally {
			isCapturingRef.current = false;
		}
	}, [isSubmitting, onSubmit]);

	useEffect(() => {
		if (
			phase !== "capturing" ||
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
				isCapturingRef.current ||
				isSubmitting
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
				setStatusMessage(
					result.faceLandmarks.length > 1
						? "Keep only one face in frame."
						: "Place your face in the frame.",
				);
				return;
			}

			const analysis = analyzeLoginFace(landmarks);
			setStatusMessage(analysis.message);

			if (!analysis.holdReady) {
				holdStartedAtRef.current = null;
				setHoldProgress(0);
				return;
			}

			if (holdStartedAtRef.current === null) {
				holdStartedAtRef.current = timestamp;
			}

			const progress = Math.min(
				(timestamp - holdStartedAtRef.current) / FACE_LOGIN_HOLD_DURATION_MS,
				1,
			);
			setHoldProgress(progress);

			if (progress >= 1) {
				if (animationFrameRef.current !== null) {
					cancelAnimationFrame(animationFrameRef.current);
					animationFrameRef.current = null;
				}
				void handleCapture();
			}
		};

		animationFrameRef.current = requestAnimationFrame(tick);

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [handleCapture, isSubmitting, phase]);

	const canClose = phase !== "submitting" && !isSubmitting;

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-6">
			<div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl ring-1 ring-white/10">
				<div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
					<div>
						<h3 className="text-lg font-bold">Face ID Sign In</h3>
						<p className="mt-1 text-sm text-white/55">
							Use the same live frame as enrollment to verify {email}.
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
								<p className="text-sm font-semibold">Verifying Face ID...</p>
							</div>
						)}

						{phase === "error" && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-red-950/65 px-6 text-center">
								<span className="material-symbols-outlined text-7xl text-red-300">
									error
								</span>
								<p className="text-lg font-bold">Camera unavailable</p>
								<p className="max-w-sm text-sm text-red-100/85">
									{statusMessage}
								</p>
							</div>
						)}
					</div>

					<div className="flex min-h-[440px] flex-col gap-5 bg-slate-900 px-6 py-6 lg:min-h-[720px]">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
								Face ID
							</p>
							<p className="mt-2 text-2xl font-bold">Live camera check</p>
							<p className="mt-2 text-sm text-white/60">{statusMessage}</p>
						</div>

						<div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
							<p className="text-sm font-semibold">Front face check</p>
							<p className="text-sm text-white/60">
								Auto capture will run when your face is centered and looking straight at the camera.
							</p>
							<div className="space-y-2">
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

	const handleFaceIdLogin = async (file: File) => {
		const emailError = getAdminEmailError(adminId);

		if (emailError) {
			setErrorMessage(emailError);
			return;
		}

		resetMessages();
		setIsSubmittingFaceId(true);

		try {
			const identity = await resolveBrowserIdentity();

			if (!identity) {
				setFaceIdNotice(
					"We could not identify this browser. Please sign in with OTP instead.",
				);
				return;
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
				setFaceIdNotice(getFaceIdBrowserNotice(payload?.errorCode));
				throw new Error(
					getApiErrorMessage(payload, "Unable to sign in with Face ID."),
				);
			}

			setIsFaceIdOverlayOpen(false);
			router.push(payload?.nextPage || "/admin/dashboard");
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to sign in with Face ID.",
			);
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
					isSubmitting={isSubmittingFaceId}
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
