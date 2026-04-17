export const FACE_ID_ENROLL_STEPS = [
	{ id: "front", label: "Front", hint: "Look straight at the camera." },
	{ id: "left", label: "Left", hint: "Turn slightly to the left." },
	{ id: "right", label: "Right", hint: "Turn slightly to the right." },
	{ id: "up", label: "Up", hint: "Raise your chin a little." },
	{ id: "down", label: "Down", hint: "Lower your chin a little." },
] as const;

export type FaceIdStepId = (typeof FACE_ID_ENROLL_STEPS)[number]["id"];

const FACE_ID_ERROR_MESSAGES: Record<string, string> = {
	ADMIN_NOT_FOUND: "Email admin khong ton tai.",
	BROWSER_FINGERPRINT_REQUIRED:
		"Khong the xac dinh browser hien tai. Vui long dang nhap bang OTP.",
	BROWSER_NOT_OTP_VERIFIED:
		"Browser nay chua tung dang nhap OTP. Vui long dang nhap OTP truoc.",
	FACE_ID_NOT_ENABLED_FOR_BROWSER:
		"Face ID chua duoc bat cho browser nay. Vui long dang nhap OTP roi bat trong settings.",
	FACE_NOT_MATCHED: "Khuon mat khong khop. Vui long thu lai.",
	FACE_PROFILE_NOT_FOUND: "Tai khoan nay chua dang ky Face ID.",
	INVALID_IMAGE: "Anh khong hop le. Vui long thu lai.",
	MULTIPLE_FACES_DETECTED:
		"Anh co nhieu khuon mat. Vui long chup mot minh.",
	NO_FACE_DETECTED: "Khong nhan dien duoc khuon mat. Vui long chup lai.",
	WORKER_TIMEOUT: "He thong xu ly qua lau. Vui long thu lai.",
	// --- Adaptive liveness (silent / challenge) error codes ---
	// These are mapped for debug logging / future surfacing only; the login UX
	// shows a generic "Couldn't verify you, please try again" regardless.
	ANTISPOOF_FAILED: "Khong the xac thuc (anti-spoof). Vui long thu lai.",
	CHALLENGE_EXPIRED: "Thao tac qua thoi gian cho. Vui long thu lai.",
	CHALLENGE_FAILED: "Khong nhan duoc dung thao tac. Vui long thu lai.",
	LIVENESS_FAILED: "Khong the xac thuc la nguoi that. Vui long thu lai.",
	NONCE_EXPIRED: "Phien da het han. Vui long thu lai.",
	NONCE_INVALID: "Phien khong hop le. Vui long thu lai.",
};

/**
 * Generic, non-leaky message shown to end users when adaptive liveness fails.
 * Never surface raw errorCode values — they teach attackers what to tune.
 */
export const FACE_LOGIN_GENERIC_FAILURE =
	"Couldn't verify you, please try again";

export function mapFaceIdErrorMessage(
	errorCode: unknown,
	fallback = "Unable to process Face ID request.",
) {
	if (typeof errorCode === "string" && FACE_ID_ERROR_MESSAGES[errorCode]) {
		return FACE_ID_ERROR_MESSAGES[errorCode];
	}

	return fallback;
}

export function getFaceIdBrowserNotice(errorCode: unknown) {
	switch (errorCode) {
		case "BROWSER_NOT_OTP_VERIFIED":
			return "This browser is not recognized, please login with OTP first to enable";
		case "FACE_ID_NOT_ENABLED_FOR_BROWSER":
			return "Face ID is not enabled for this browser yet. Login with OTP, then enable it in settings.";
		case "BROWSER_FINGERPRINT_REQUIRED":
			return "We could not identify this browser. Please sign in with OTP instead.";
		default:
			return "";
	}
}
