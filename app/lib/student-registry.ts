export type StudentStatus = "Active" | "Suspended" | "Graduated";

export type StudentRecord = {
	email: string;
	first_name: string;
	id: string;
	last_name: string;
	status: StudentStatus;
};

type BackendStudentRecord = {
	email?: unknown;
	first_name?: unknown;
	id?: unknown;
	last_name?: unknown;
	status?: unknown;
};

type StudentCollectionPayload =
	| BackendStudentRecord[]
	| {
			data?: unknown;
			students?: unknown;
	  };

function toTitleCase(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function normalizeStudentStatus(value: unknown): StudentStatus {
	if (typeof value !== "string") {
		return "Active";
	}

	const normalized = value.trim().toLowerCase();

	if (normalized === "graduated") {
		return "Graduated";
	}

	if (normalized === "inactive" || normalized === "suspended") {
		return "Suspended";
	}

	if (normalized === "active") {
		return "Active";
	}

	return toTitleCase(normalized) as StudentStatus;
}

export function toBackendStudentStatus(value: StudentStatus) {
	if (value === "Suspended") {
		return "inactive";
	}

	return value.toLowerCase();
}

export function normalizeStudentRecord(value: unknown): StudentRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const student = value as BackendStudentRecord;

	if (
		typeof student.id !== "string" ||
		typeof student.first_name !== "string" ||
		typeof student.last_name !== "string" ||
		typeof student.email !== "string"
	) {
		return null;
	}

	return {
		email: student.email,
		first_name: student.first_name,
		id: student.id,
		last_name: student.last_name,
		status: normalizeStudentStatus(student.status),
	};
}

export function extractStudentCollection(payload: StudentCollectionPayload) {
	const source = Array.isArray(payload)
		? payload
		: Array.isArray(payload.students)
			? payload.students
			: Array.isArray(payload.data)
				? payload.data
				: [];

	return source
		.map((student) => normalizeStudentRecord(student))
		.filter((student): student is StudentRecord => student !== null);
}

export function extractStudentRecord(payload: unknown) {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const candidate = payload as {
		data?: unknown;
		student?: unknown;
	};

	return (
		normalizeStudentRecord(candidate.student) ??
		normalizeStudentRecord(candidate.data) ??
		normalizeStudentRecord(payload)
	);
}

export function extractInitialPassword(payload: unknown) {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const candidate = payload as {
		credentials?: {
			initialPassword?: unknown;
		};
	};

	return typeof candidate.credentials?.initialPassword === "string"
		? candidate.credentials.initialPassword
		: null;
}
