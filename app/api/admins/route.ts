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

export async function GET(request: Request) {
	const backendResponse = await fetch(buildBackendUrl("/admins"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: request.headers.get("cookie") ?? "",
		},
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

export async function POST(request: Request) {
	const body = await request.json();
	const backendResponse = await fetch(buildBackendUrl("/admins"), {
		body: JSON.stringify(body),
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			cookie: request.headers.get("cookie") ?? "",
		},
		method: "POST",
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
