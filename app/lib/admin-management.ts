import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth";
import {
	buildBackendUrl,
	getApiErrorMessage,
	readJson,
} from "@/app/lib/backend";

export type AdminAccount = {
	email: string;
	id: string;
	name: string;
};

export type AdminSettings = {
	face_id_enabled: boolean;
	session_timeout: number;
};

type AdminAccountPayload =
	| AdminAccount[]
	| {
			admins?: unknown;
			data?: unknown;
	  };

type AdminSettingsPayload = {
	data?: unknown;
	face_id_enabled?: unknown;
	session_timeout?: unknown;
	settings?: unknown;
};

function normalizeAdminAccount(value: unknown): AdminAccount | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as {
		email?: unknown;
		id?: unknown;
		name?: unknown;
	};

	if (
		typeof record.id !== "string" ||
		typeof record.name !== "string" ||
		typeof record.email !== "string"
	) {
		return null;
	}

	return {
		email: record.email,
		id: record.id,
		name: record.name,
	};
}

function extractAdminAccounts(payload: AdminAccountPayload) {
	const source = Array.isArray(payload)
		? payload
		: Array.isArray(payload.admins)
			? payload.admins
			: Array.isArray(payload.data)
				? payload.data
				: [];

	return source
		.map((admin) => normalizeAdminAccount(admin))
		.filter((admin): admin is AdminAccount => admin !== null);
}

function normalizeAdminSettings(value: unknown): AdminSettings {
	if (!value || typeof value !== "object") {
		return {
			face_id_enabled: false,
			session_timeout: 30,
		};
	}

	const record = value as {
		face_id_enabled?: unknown;
		session_timeout?: unknown;
	};

	return {
		face_id_enabled:
			typeof record.face_id_enabled === "boolean"
				? record.face_id_enabled
				: false,
		session_timeout:
			typeof record.session_timeout === "number"
				? record.session_timeout
				: 30,
	};
}

export async function getAdminAccounts(): Promise<AdminAccount[]> {
	const session = await requireRole("admin");
	const response = await fetch(buildBackendUrl("/admins"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: session.cookieHeader,
		},
	});

	if (response.status === 401 || response.status === 403) {
		redirect("/login");
	}

	if (!response.ok) {
		throw new Error(await getApiErrorMessage(response));
	}

	const payload = await readJson<unknown>(response);

	if (!payload) {
		return [];
	}

	return extractAdminAccounts(payload as AdminAccountPayload);
}

export async function getAdminSettings(): Promise<AdminSettings> {
	const session = await requireRole("admin");
	const response = await fetch(buildBackendUrl("/settings"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: session.cookieHeader,
		},
	});

	if (response.status === 401 || response.status === 403) {
		redirect("/login");
	}

	if (!response.ok) {
		throw new Error(await getApiErrorMessage(response));
	}

	const payload = await readJson<AdminSettingsPayload>(response);

	if (!payload) {
		return {
			face_id_enabled: false,
			session_timeout: 30,
		};
	}

	return normalizeAdminSettings(
		payload.settings ?? payload.data ?? payload,
	);
}
