import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";

/**
 * Adaptive face-login step 1: obtain a short-lived nonce bound to this
 * browser. The Nest backend (`/admin/face-login/nonce`) validates that the
 * admin email exists, that the browser fingerprint is known and OTP-verified,
 * and returns `{ nonce, ttlSec }`. The nonce is later submitted alongside the
 * frames to `/silent` (and/or `/challenge`) to prevent replay.
 *
 * This is an unauthenticated endpoint (no session cookies required), mirroring
 * the existing `/api/auth/admin/faceid/login` proxy.
 */
export async function POST(request: Request) {
	try {
		// Accept JSON body so the client can simply send
		// { email, browserFingerprint, browserLabel } without building FormData.
		const body = (await request.json().catch(() => null)) as unknown;

		const backendResponse = await fetch(
			buildBackendUrl("/admin/faceid/nonce"),
			{
				body: JSON.stringify(body ?? {}),
				cache: "no-store",
				headers: { "content-type": "application/json" },
				method: "POST",
			},
		);

		const payload = await readJson<unknown>(backendResponse);
		const response = NextResponse.json(payload ?? null, {
			status: backendResponse.status,
		});

		// The nonce route shouldn't set session cookies, but forward any the
		// backend emits (e.g. rate-limit cookies) just in case.
		appendSetCookieHeaders(backendResponse, response.headers);

		return response;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to reach Face ID nonce backend.";

		return NextResponse.json(
			{ message, statusCode: 502 },
			{ status: 502 },
		);
	}
}
