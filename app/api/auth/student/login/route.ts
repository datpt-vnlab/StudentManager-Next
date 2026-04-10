import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";
import { ROLE_COOKIE } from "@/app/lib/session";

export async function POST(request: Request) {
	const body = await request.json();
	const backendResponse = await fetch(
		buildBackendUrl("/auth/student/login"),
		{
			body: JSON.stringify(body),
			cache: "no-store",
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		},
	);

	const payload = await readJson<unknown>(backendResponse);
	const response = NextResponse.json(payload ?? null, {
		status: backendResponse.status,
	});

	if (backendResponse.ok) {
		response.cookies.set({
			httpOnly: true,
			name: ROLE_COOKIE,
			path: "/",
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			value: "student",
		});
	} else {
		response.cookies.delete(ROLE_COOKIE);
	}

	appendSetCookieHeaders(backendResponse, response.headers);

	return response;
}
