export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const ROLE_COOKIE = "portal_role";

export type UserRole = "admin" | "student";

function decodeBase64Url(value: string) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

	return new TextDecoder().decode(bytes);
}

export function decodeJwtPayload(token: string) {
	const [, payload] = token.split(".");

	if (!payload) {
		return null;
	}

	try {
		return JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function normalizeRole(value: unknown): UserRole | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const normalized = normalizeRole(item);
			if (normalized) {
				return normalized;
			}
		}

		return null;
	}

	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;

		return (
			normalizeRole(record.role) ??
			normalizeRole(record.roles) ??
			normalizeRole(record.authorities)
		);
	}

	if (typeof value !== "string") {
		return null;
	}

	const upper = value.trim().toUpperCase();

	if (upper.includes("ADMIN")) {
		return "admin";
	}

	if (upper.includes("STUDENT")) {
		return "student";
	}

	return null;
}

export function getRoleFromAccessToken(token?: string | null) {
	if (!token) {
		return null;
	}

	const payload = decodeJwtPayload(token);

	if (!payload) {
		return null;
	}

	return (
		normalizeRole(payload.role) ??
		normalizeRole(payload.roles) ??
		normalizeRole(payload.authorities) ??
		normalizeRole(payload.scope) ??
		normalizeRole(payload.realm_access)
	);
}

export function getDashboardPath(role: UserRole) {
	return role === "admin" ? "/admin/dashboard" : "/student/dashboard";
}
