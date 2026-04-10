import { cache } from "react";
import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth";
import {
	buildBackendUrl,
	getApiErrorMessage,
	readJson,
} from "@/app/lib/backend";

export type StudentPortalProfile = {
	address?: string;
	avatarUrl?: string;
	birthday?: string;
	id: string;
	email: string;
	gender?: string;
	majorId?: string;
	major?: string;
	name: string;
};

type StudentPortalResponse = {
	student?: {
		address?: string;
		avatarUrl?: string;
		birthday?: string;
		email?: string;
		firstName?: string;
		gender?: string;
		id?: string;
		lastName?: string;
		major?:
			| string
			| {
					id?: string;
					major?: string;
					major_name?: string;
					name?: string;
			  };
		majorId?: string;
		name?: string;
	};
};

function normalizeMajor(
	value:
		| string
		| {
				id?: string;
				major?: string;
				major_name?: string;
				name?: string;
		  }
		| undefined,
) {
	if (typeof value === "string") {
		return value.trim() || undefined;
	}

	if (!value || typeof value !== "object") {
		return undefined;
	}

	const majorName =
		typeof value.major_name === "string"
			? value.major_name
			: typeof value.major === "string"
				? value.major
				: typeof value.name === "string"
					? value.name
					: "";

	return majorName.trim() || undefined;
}

export const getStudentPortalProfile = cache(async function getStudentPortalProfile() {
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
		address: student.address?.trim() || undefined,
		avatarUrl: student.avatarUrl?.trim() || undefined,
		birthday: student.birthday?.trim() || undefined,
		email: student.email,
		gender: student.gender?.trim() || undefined,
		id: student.id,
		major: normalizeMajor(student.major),
		majorId: student.majorId?.trim() || undefined,
		name: fullName,
	};
});
