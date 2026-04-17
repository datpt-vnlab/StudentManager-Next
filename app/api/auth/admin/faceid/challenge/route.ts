import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";
import { ROLE_COOKIE } from "@/app/lib/session";

/**
 * Adaptive face-login step 3 (challenge pass). Only called when /silent
 * returned `status:"challenge"`. The client posts:
 *   - `challengeNonce` — issued by /silent's challenge response
 *   - `frames[]`       — 5 thumb JPEGs captured *during* the prompted motion
 *                        (look_left / look_right / look_up / look_down)
 *   - `full`           — 1 full-frame JPEG
 *
 * Response shape matches /silent. Cookie semantics match /silent — only a
 * `status:"success"` payload sets the ROLE_COOKIE and forwards session
 * cookies from the backend. A second `status:"challenge"` is treated by the
 * client as a failure (no challenge chaining).
 */
export async function POST(request: Request) {
	try {
		const incoming = await request.formData();
		const forwarded = new FormData();
		for (const [key, value] of incoming.entries()) {
			forwarded.append(key, value);
		}

		const backendResponse = await fetch(
			buildBackendUrl("/admin/faceid/challenge"),
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

		// Mirror the OTP / legacy faceid/login cookie pattern: set ROLE_COOKIE
		// on any backend 2xx and forward access_token / refresh_token via
		// appendSetCookieHeaders. Previously we gated on the literal
		// status:"success" string in the payload, but the envelope may differ
		// (data wrapper, casing, etc.) — which silently dropped the session
		// cookie and made the user appear logged out.
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
				: "Unable to reach Face ID challenge backend.";
		return NextResponse.json(
			{ message, statusCode: 502 },
			{ status: 502 },
		);
	}
}
