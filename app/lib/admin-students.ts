import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth";
import {
	buildBackendUrl,
	getApiErrorMessage,
	readJson,
} from "@/app/lib/backend";
import {
	extractStudentCollection,
	type StudentRecord,
} from "@/app/lib/student-registry";

export async function getAdminStudents(): Promise<StudentRecord[]> {
	const session = await requireRole("admin");
	const response = await fetch(buildBackendUrl("/students"), {
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

	return extractStudentCollection(payload as never);
}
