import { NextResponse } from "next/server";
import {
	appendSetCookieHeaders,
	buildBackendUrl,
	readJson,
} from "@/app/lib/backend";

export async function POST(request: Request) {
	const body = await request.json();
	const backendResponse = await fetch(
		buildBackendUrl("/auth/admin/otp/send"),
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

	appendSetCookieHeaders(backendResponse, response.headers);

	return response;
}
