import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth";
import {
	buildBackendUrl,
	getApiErrorMessage,
	readJson,
} from "@/app/lib/backend";

export type StudentPortalProfile = {
	id: string;
	name: string;
	email: string;
};

type StudentPortalResponse = {
	student?: {
		email?: string;
		firstName?: string;
		id?: string;
		lastName?: string;
		name?: string;
	};
};

export async function getStudentPortalProfile() {
	const session = await requireRole("student");
	const response = await fetch(buildBackendUrl("/student-portal/me"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: session.cookieHeader,
		},
	});
	if (response.status === 401 || response.status === 403) {
		redirect("/login");
		// console.log(response.status);
	}

	if (!response.ok) {
		throw new Error(await getApiErrorMessage(response));
	}

	const payload = await readJson<StudentPortalResponse>(response);

	if (!payload) {
		throw new Error("Student profile response was empty.");
	}

	const student = payload.student;
	const fullName =
		student?.name?.trim() ||
		[student?.firstName, student?.lastName].filter(Boolean).join(" ").trim();

	if (!student?.id || !student?.email || !fullName) {
		throw new Error("Student profile response was missing required fields.");
	}

	return {
		email: student.email,
		id: student.id,
		name: fullName,
	};
}
