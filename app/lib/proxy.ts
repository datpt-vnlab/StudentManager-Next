import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
	ACCESS_TOKEN_COOKIE,
	getDashboardPath,
	getRoleFromAccessToken,
	normalizeRole,
	ROLE_COOKIE,
} from "@/app/lib/session";

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
	const roleCookie = request.cookies.get(ROLE_COOKIE)?.value ?? null;
	const role =
		normalizeRole(roleCookie) ?? getRoleFromAccessToken(accessToken);

	if (pathname === "/login") {
		if (accessToken && role) {
			return NextResponse.redirect(
				new URL(getDashboardPath(role), request.url),
			);
		}

		return NextResponse.next();
	}

	if (pathname.startsWith("/student")) {
		if (!accessToken) {
			console.log("No access token for student path", pathname);
			return NextResponse.redirect(new URL("/login", request.url));
		}

		if (role && role !== "student") {
			return NextResponse.redirect(
				new URL(getDashboardPath(role), request.url),
			);
		}
	}

	if (pathname.startsWith("/admin")) {
		if (!accessToken) {
			return NextResponse.redirect(new URL("/login", request.url));
		}

		if (role && role !== "admin") {
			return NextResponse.redirect(
				new URL(getDashboardPath(role), request.url),
			);
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/login", "/student/:path*", "/admin/:path*"],
};
