import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";
import {
	ACCESS_TOKEN_COOKIE,
	REFRESH_TOKEN_COOKIE,
	ROLE_COOKIE,
} from "@/app/lib/session";

function clearSessionCookies(response: NextResponse) {
	response.cookies.set({
		maxAge: 0,
		name: ACCESS_TOKEN_COOKIE,
		path: "/",
		value: "",
	});
	response.cookies.set({
		maxAge: 0,
		name: REFRESH_TOKEN_COOKIE,
		path: "/",
		value: "",
	});
	response.cookies.set({
		maxAge: 0,
		name: ROLE_COOKIE,
		path: "/",
		value: "",
	});
}

export async function POST(request: Request) {
	try {
		const incomingFormData = await request.formData();
		const formData = new FormData();

		for (const [key, value] of incomingFormData.entries()) {
			formData.append(key, value);
		}

		const backendResponse = await fetch(
			buildBackendUrl("/admin/faceid/enroll"),
			{
				body: formData,
				cache: "no-store",
				headers: {
					cookie: request.headers.get("cookie") ?? "",
				},
				method: "POST",
			},
		);
		const payload = await readJson<unknown>(backendResponse);
		const response = NextResponse.json(payload ?? null, {
			status: backendResponse.status,
		});

		appendSetCookieHeaders(backendResponse, response.headers);

		if (backendResponse.status === 401 || backendResponse.status === 403) {
			clearSessionCookies(response);
		}

		return response;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to reach Face ID enroll backend.";

		return NextResponse.json(
			{
				message,
				statusCode: 502,
			},
			{
				status: 502,
			},
		);
	}
}
