"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	value: StatusResponse["data"] extends { currentBrowser?: infer T } ? T : unknown,
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
	const [phase, setPhase] = useState<EnrollmentPhase>("requesting_camera");
	const [captures, setCaptures] = useState<FaceCaptureMap>(() =>
		createEmptyCaptures(),
	);
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [statusMessage, setStatusMessage] = useState(
		"Requesting access to your camera...",
	);
	const [isBusy, setIsBusy] = useState(false);

	const currentStep = FACE_ID_ENROLL_STEPS[currentStepIndex];
	const completedCount = useMemo(
		() => Object.values(captures).filter(Boolean).length,
		[captures],
	);

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

				setPhase("capturing");
				setStatusMessage("Align your face inside the frame and capture each angle.");
			} catch {
				setPhase("error");
				setStatusMessage(
					"Camera access is required to enroll Face ID on this device.",
				);
			}
		}

		void setupCamera();

		return () => {
			cancelled = true;
			const stream = streamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			}
		};
	}, []);

	const captureCurrentStep = async () => {
		if (
			!videoRef.current ||
			!canvasRef.current ||
			!currentStep
		) {
			return;
		}

		setIsBusy(true);

		try {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			const dataUrl = captureVisibleVideoFrame(video, canvas);
			console.log("Face ID captured image:", dataUrl);
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
				setStatusMessage(FACE_ID_ENROLL_STEPS[nextIndex].hint);
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
			setIsBusy(false);
		}
	};

	const retryFromStart = async () => {
		setCaptures(createEmptyCaptures());
		setCurrentStepIndex(0);
		setPhase(streamRef.current ? "capturing" : "requesting_camera");
		setStatusMessage(FACE_ID_ENROLL_STEPS[0].hint);
	};

	return (
		<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-6">
			<div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl ring-1 ring-white/10">
				<div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
					<div>
						<h3 className="text-lg font-bold">Face ID Enrollment</h3>
						<p className="mt-1 text-sm text-white/55">
							Keep only one face in frame and follow the guided angles.
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

				<div className="grid gap-0 lg:min-h-[720px] lg:grid-cols-[1.5fr_0.9fr]">
					<div className="relative min-h-[440px] bg-black lg:min-h-[720px]">
						<video
							ref={videoRef}
							autoPlay
							muted
							playsInline
							className="h-full min-h-[440px] w-full object-cover lg:min-h-[720px]"
						/>
						<canvas ref={canvasRef} className="hidden" />

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

					<div className="flex min-h-[440px] flex-col gap-5 bg-slate-900 px-6 py-6 lg:min-h-[720px]">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
								Progress
							</p>
							<p className="mt-2 text-3xl font-bold">
								{completedCount}/{FACE_ID_ENROLL_STEPS.length}
							</p>
							<p className="mt-2 text-sm text-white/60">
								{statusMessage}
							</p>
						</div>

						<div className="space-y-3">
							{FACE_ID_ENROLL_STEPS.map((step, index) => {
								const isCurrent = index === currentStepIndex;
								const isDone = Boolean(captures[step.id]);

								return (
									<div
										key={step.id}
										className={`rounded-2xl border px-4 py-3 transition ${
											isDone
												? "border-emerald-400/40 bg-emerald-400/10"
												: isCurrent
													? "border-cyan-300/50 bg-cyan-300/10"
													: "border-white/10 bg-white/5"
										}`}
									>
										<div className="flex items-center gap-3">
											<div
												className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
													isDone
														? "bg-emerald-300 text-slate-950"
														: isCurrent
															? "bg-cyan-300 text-slate-950"
															: "bg-white/10 text-white/70"
												}`}
											>
												{isDone ? (
													<span className="material-symbols-outlined text-lg">
														check
													</span>
												) : (
													index + 1
												)}
											</div>
											<div>
												<p className="font-semibold">{step.label}</p>
												<p className="text-sm text-white/55">
													{step.hint}
												</p>
											</div>
										</div>
									</div>
								);
							})}
						</div>

						<div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
							<p className="text-sm font-semibold">
								{currentStep?.label ?? "Ready"}
							</p>
							<p className="text-sm text-white/60">
								{currentStep?.hint ??
									"Your five angles are ready to be verified."}
							</p>
							<button
								type="button"
								onClick={() => void captureCurrentStep()}
								disabled={
									phase !== "capturing" || isBusy || !currentStep
								}
								className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<span className="material-symbols-outlined text-[18px]">
									photo_camera
								</span>
								{currentStepIndex === FACE_ID_ENROLL_STEPS.length - 1
									? "Capture Final Angle"
									: "Capture This Angle"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function FaceIdSection({
}: Record<string, never>) {
	const initialBrowserIdentity = getCachedBrowserIdentity();
	const [hasFaceProfile, setHasFaceProfile] = useState(false);
	const [isLoadingStatus, setIsLoadingStatus] = useState(true);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isUpdatingBrowserAccess, setIsUpdatingBrowserAccess] = useState(false);
	const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
	const [fingerprintStatus, setFingerprintStatus] =
		useState<BrowserFingerprintStatus>(
			initialBrowserIdentity ? "ready" : "idle",
		);
	const [browserIdentity, setBrowserIdentity] = useState<BrowserIdentity | null>(
		initialBrowserIdentity,
	);
	const browserIdentityRef = useRef<BrowserIdentity | null>(initialBrowserIdentity);
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
						getErrorMessage(payload, "Unable to load Face ID status."),
					);
				}

				setHasFaceProfile(
					Boolean(payload?.data && payload.data.hasFaceProfile === true),
				);
				setCurrentBrowser(
					normalizeCurrentBrowserStatus(payload?.data?.currentBrowser),
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
					getErrorMessage(payload, "Unable to delete Face ID profile."),
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
				? "Ban chua dang ky Face ID."
				: currentBrowser.faceIdEnabled
						? "Browser nay co the dung Face ID de login."
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
									: currentBrowser.browserLabel || browserIdentity?.browserLabel || "Current browser"}
							</p>
							<p className="text-sm">{browserBlockMessage}</p>
							{hasFaceProfile && !currentBrowser.faceIdEnabled && (
									<p className="text-xs opacity-80">
										Toggle this on to allow Face ID login on the current browser only.
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
												? "Browser nay san sang cho Face ID login."
												: "Bat quyen su dung Face ID cho browser hien tai."
									}
								>
									<Toggle
										checked={currentBrowser.faceIdEnabled}
										disabled={browserToggleDisabled}
										onChange={(value) => {
											void handleBrowserAccessChange(value);
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
					Enrollment and browser access are separate steps. After enrollment,
					you can enable Face ID for the current browser immediately.
				</p>
			</SectionCard>
		</>
	);
}
