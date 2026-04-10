"use client";

import FingerprintJS from "@fingerprintjs/fingerprintjs";

export type BrowserFingerprintStatus = "idle" | "loading" | "ready" | "failed";

export type BrowserIdentity = {
	browserFingerprint: string;
	browserLabel: string;
};

let fingerprintAgentPromise:
	| ReturnType<typeof FingerprintJS.load>
	| null = null;
let browserIdentityCache: BrowserIdentity | null = null;
const BROWSER_IDENTITY_STORAGE_KEY = "studentmanager.browserIdentity";

function getFingerprintAgent() {
	if (!fingerprintAgentPromise) {
		fingerprintAgentPromise = FingerprintJS.load();
	}

	return fingerprintAgentPromise;
}

function isBrowserIdentity(value: unknown): value is BrowserIdentity {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Record<string, unknown>;

	return (
		typeof record.browserFingerprint === "string" &&
		record.browserFingerprint.length > 0 &&
		typeof record.browserLabel === "string" &&
		record.browserLabel.length > 0
	);
}

export function getCachedBrowserIdentity() {
	if (browserIdentityCache) {
		return browserIdentityCache;
	}

	if (typeof window === "undefined") {
		return null;
	}

	try {
		const storedIdentity = window.localStorage.getItem(
			BROWSER_IDENTITY_STORAGE_KEY,
		);

		if (!storedIdentity) {
			return null;
		}

		const parsedIdentity = JSON.parse(storedIdentity) as unknown;

		if (!isBrowserIdentity(parsedIdentity)) {
			window.localStorage.removeItem(BROWSER_IDENTITY_STORAGE_KEY);
			return null;
		}

		browserIdentityCache = parsedIdentity;
		return parsedIdentity;
	} catch {
		return null;
	}
}

function storeBrowserIdentity(identity: BrowserIdentity) {
	browserIdentityCache = identity;

	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			BROWSER_IDENTITY_STORAGE_KEY,
			JSON.stringify(identity),
		);
	} catch {
		// Ignore storage failures and fall back to the in-memory cache.
	}
}

export function getBrowserLabel() {
	if (typeof navigator === "undefined") {
		return "Unknown browser";
	}

	return navigator.userAgent;
}

export async function getBrowserFingerprint() {
	const agent = await getFingerprintAgent();
	const result = await agent.get();

	return {
		visitorId: result.visitorId,
	};
}

export async function getBrowserIdentity(): Promise<BrowserIdentity> {
	const cachedIdentity = getCachedBrowserIdentity();

	if (cachedIdentity) {
		return cachedIdentity;
	}

	const fingerprint = await getBrowserFingerprint();
	const identity = {
		browserFingerprint: fingerprint.visitorId,
		browserLabel: getBrowserLabel(),
	};

	storeBrowserIdentity(identity);

	return identity;
}
