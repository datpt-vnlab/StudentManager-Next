import "server-only";

export function getBackendBaseUrl() {
	const baseUrl = process.env.NEST_API_BASE_URL;

	if (!baseUrl) {
		throw new Error("Missing NEST_API_BASE_URL.");
	}

	return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function buildBackendUrl(pathname: string) {
	const normalizedPath = pathname.startsWith("/")
		? pathname.slice(1)
		: pathname;

	return new URL(normalizedPath, getBackendBaseUrl()).toString();
}

export async function getApiErrorMessage(response: Response) {
	try {
		const data = (await response.json()) as {
			message?: string | string[];
			error?: string;
			errors?: string[];
		};

		if (typeof data.message === "string" && data.message.trim()) {
			return data.message;
		}

		if (Array.isArray(data.message) && data.message.length > 0) {
			return data.message.join(", ");
		}

		if (typeof data.error === "string" && data.error.trim()) {
			return data.error;
		}

		if (Array.isArray(data.errors) && data.errors.length > 0) {
			return data.errors.join(", ");
		}
	} catch {
		// Ignore invalid JSON payloads.
	}

	return response.statusText || "Request failed.";
}

export async function readJson<T>(response: Response) {
	try {
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

function splitCombinedSetCookieHeader(value: string) {
	return value
		.split(/,(?=\s*[^;,\s]+=)/g)
		.map((cookie) => cookie.trim())
		.filter(Boolean);
}

function getSetCookieHeaders(source: Response) {
	const sourceHeaders = source.headers as Headers & {
		getSetCookie?: () => string[];
		raw?: () => Record<string, string[]>;
	};
	const directSetCookies = sourceHeaders.getSetCookie?.() ?? [];

	if (directSetCookies.length > 0) {
		return directSetCookies;
	}

	const rawSetCookies = sourceHeaders.raw?.()["set-cookie"] ?? [];

	if (rawSetCookies.length > 0) {
		return rawSetCookies;
	}

	const fallbackCookie = source.headers.get("set-cookie");

	if (!fallbackCookie) {
		return [];
	}

	return splitCombinedSetCookieHeader(fallbackCookie);
}

export function appendSetCookieHeaders(source: Response, target: Headers) {
	for (const cookie of getSetCookieHeaders(source)) {
		target.append("set-cookie", cookie);
	}
}
