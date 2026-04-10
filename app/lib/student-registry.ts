export type StudentStatus = "Active" | "Suspended" | "Graduated";

export type StudentRecord = {
	address?: string;
	birthday?: string;
	email: string;
	first_name: string;
	gender?: string;
	id: string;
	last_name: string;
	major_id?: string;
	major?: string;
	status: StudentStatus;
};

export type MajorOption = {
	id: string;
	name: string;
};

type BackendStudentRecord = {
	address?: unknown;
	birthday?: unknown;
	email?: unknown;
	first_name?: unknown;
	gender?: unknown;
	id?: unknown;
	last_name?: unknown;
	majorId?: unknown;
	major_id?: unknown;
	major?:
		| unknown
		| {
				id?: unknown;
				major?: unknown;
				major_name?: unknown;
				name?: unknown;
		  };
	status?: unknown;
};

type BackendMajorRecord = {
	id?: unknown;
	major?: unknown;
	major_id?: unknown;
	name?: unknown;
};

type StudentCollectionPayload =
	| BackendStudentRecord[]
	| {
			data?: unknown;
			students?: unknown;
	  };

type MajorCollectionPayload =
	| BackendMajorRecord[]
	| {
			data?: unknown;
			majors?: unknown;
	  };

function toTitleCase(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeDateInput(value: unknown) {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();

	if (!trimmed) {
		return undefined;
	}

	const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);

	return match?.[1] ?? trimmed;
}

function normalizeMajorName(value: BackendStudentRecord["major"]) {
	if (typeof value === "string") {
		return value.trim() || undefined;
	}

	if (!value || typeof value !== "object") {
		return undefined;
	}

	const record = value as {
		major?: unknown;
		major_name?: unknown;
		name?: unknown;
	};

	if (typeof record.major_name === "string") {
		return record.major_name.trim() || undefined;
	}

	if (typeof record.major === "string") {
		return record.major.trim() || undefined;
	}

	if (typeof record.name === "string") {
		return record.name.trim() || undefined;
	}

	return undefined;
}

function normalizeMajorId(student: BackendStudentRecord) {
	if (typeof student.major_id === "string") {
		return student.major_id.trim() || undefined;
	}

	if (typeof student.majorId === "string") {
		return student.majorId.trim() || undefined;
	}

	if (student.major && typeof student.major === "object") {
		const record = student.major as {
			id?: unknown;
		};

		return typeof record.id === "string"
			? record.id.trim() || undefined
			: undefined;
	}

	return undefined;
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
		address:
			typeof student.address === "string"
				? student.address.trim() || undefined
				: undefined,
		birthday: normalizeDateInput(student.birthday),
		email: student.email,
		first_name: student.first_name,
		gender:
			typeof student.gender === "string"
				? student.gender.trim() || undefined
				: undefined,
		id: student.id,
		last_name: student.last_name,
		major_id: normalizeMajorId(student),
		major: normalizeMajorName(student.major),
		status: normalizeStudentStatus(student.status),
	};
}

export function normalizeMajorRecord(value: unknown): MajorOption | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const major = value as BackendMajorRecord;
	const id =
		typeof major.major_id === "string"
			? major.major_id
			: typeof major.id === "string"
				? major.id
				: null;
	const name =
		typeof major.major === "string"
			? major.major
			: typeof major.name === "string"
				? major.name
				: null;

	if (!id || !name) {
		return null;
	}

	return {
		id,
		name,
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

export function extractMajorCollection(payload: MajorCollectionPayload) {
	const source = Array.isArray(payload)
		? payload
		: Array.isArray(payload.majors)
			? payload.majors
			: Array.isArray(payload.data)
				? payload.data
				: [];

	return source
		.map((major) => normalizeMajorRecord(major))
		.filter((major): major is MajorOption => major !== null);
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
