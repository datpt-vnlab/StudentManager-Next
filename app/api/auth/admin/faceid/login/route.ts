import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";
import { ROLE_COOKIE } from "@/app/lib/session";

export async function POST(request: Request) {
	const incomingFormData = await request.formData();
	const formData = new FormData();

	for (const [key, value] of incomingFormData.entries()) {
		formData.append(key, value);
	}

	const backendResponse = await fetch(
		buildBackendUrl("/admin/faceid/login"),
		{
			body: formData,
			cache: "no-store",
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
			value: "admin",
		});
	} else {
		response.cookies.delete(ROLE_COOKIE);
	}

	appendSetCookieHeaders(backendResponse, response.headers);

	return response;
}
