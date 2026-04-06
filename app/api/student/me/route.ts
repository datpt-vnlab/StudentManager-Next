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

export async function PATCH(request: Request) {
	const body = await request.json();
	const backendResponse = await fetch(buildBackendUrl("/student-portal/me"), {
		body: JSON.stringify(body),
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			cookie: request.headers.get("cookie") ?? "",
		},
		method: "PATCH",
	});
	const payload = await readJson<unknown>(backendResponse);
	const response = NextResponse.json(payload ?? null, {
		status: backendResponse.status,
	});

	appendSetCookieHeaders(backendResponse, response.headers);

	if (backendResponse.status === 401 || backendResponse.status === 403) {
		clearSessionCookies(response);
	}

	return response;
}
