import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
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
	const response = NextResponse.json({ success: true });

	try {
		const backendResponse = await fetch(buildBackendUrl("/auth/logout"), {
			cache: "no-store",
			headers: {
				cookie: request.headers.get("cookie") ?? "",
			},
			method: "POST",
		});

		appendSetCookieHeaders(backendResponse, response.headers);
	} catch {
		// Local cookie cleanup is still enough to log the user out of this app.
	}

	clearSessionCookies(response);

	return response;
}
