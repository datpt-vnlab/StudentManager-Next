import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";
import { ROLE_COOKIE } from "@/app/lib/session";

/**
 * Adaptive face-login step 2 (silent pass). The client posts:
 *   - `nonce`       — issued by /nonce, binds this attempt
 *   - `frames[]`    — 5 small cropped JPEGs (~200x200, q=0.70) of the face
 *   - `full`        — 1 higher-res full-frame JPEG (<=800px long edge, q=0.85)
 *
 * The Nest backend (`/admin/face-login/silent`) forwards to the face-worker
 * which returns one of:
 *   - `{ status: "success", livenessScore, antispoofScore }`
 *   - `{ status: "challenge", prompt, challengeNonce, ttlSec }`
 *   - `{ status: "failed", errorCode }`
 *
 * On `success`, the backend also embeds the match and issues session cookies
 * via `Set-Cookie` (access_token + refresh_token). This proxy forwards those
 * headers and additionally sets `ROLE_COOKIE=admin` to match the semantics of
 * the legacy `/api/auth/admin/faceid/login` route.
 *
 * We pass the incoming FormData through verbatim rather than re-encoding —
 * this preserves `Content-Disposition`, filenames, and per-part `Content-Type`
 * which the worker relies on when parsing multipart frames.
 */
export async function POST(request: Request) {
	try {
		const incoming = await request.formData();
		const forwarded = new FormData();
		for (const [key, value] of incoming.entries()) {
			forwarded.append(key, value);
		}

		const backendResponse = await fetch(
			buildBackendUrl("/admin/faceid/silent"),
			{
				body: forwarded,
				cache: "no-store",
				method: "POST",
			},
		);

		const payload = await readJson<unknown>(backendResponse);
		const response = NextResponse.json(payload ?? null, {
			status: backendResponse.status,
		});

		// Match the working OTP / legacy faceid/login pattern exactly:
		// on any backend 2xx, set ROLE_COOKIE and forward the backend's
		// Set-Cookie headers (which carry access_token / refresh_token).
		// A `status:"challenge"` response is also 2xx but doesn't include
		// session tokens — setting ROLE_COOKIE without an access_token is
		// harmless (dashboard will still redirect to /login).
		if (backendResponse.ok) {
			response.cookies.set({
				httpOnly: true,
				name: ROLE_COOKIE,
				path: "/",
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
				value: "admin",
			});
		} else {
			response.cookies.delete(ROLE_COOKIE);
		}

		appendSetCookieHeaders(backendResponse, response.headers);

		return response;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to reach Face ID silent backend.";
		return NextResponse.json(
			{ message, statusCode: 502 },
			{ status: 502 },
		);
	}
}
