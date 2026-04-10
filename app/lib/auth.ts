import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
	ACCESS_TOKEN_COOKIE,
	getDashboardPath,
	getRoleFromAccessToken,
	normalizeRole,
	ROLE_COOKIE,
	type UserRole,
} from "@/app/lib/session";

export type SessionState = {
	accessToken: string | null;
	cookieHeader: string;
	role: UserRole | null;
};

export async function getSessionState(): Promise<SessionState> {
	const cookieStore = await cookies();
	const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
	const roleCookie = cookieStore.get(ROLE_COOKIE)?.value ?? null;
	const role =
		normalizeRole(roleCookie) ?? getRoleFromAccessToken(accessToken);

	return {
		accessToken,
		cookieHeader: cookieStore.toString(),
		role,
	};
}

export async function redirectIfAuthenticated() {
	const session = await getSessionState();

	if (session.accessToken && session.role) {
		redirect(getDashboardPath(session.role));
	}
}

export async function requireRole(expectedRole: UserRole) {
	const session = await getSessionState();

	if (!session.accessToken) {
		redirect("/login");
		// console.log("No access token");
	}

	if (session.role && session.role !== expectedRole) {
		redirect(getDashboardPath(session.role));
	}

	return session;
}
