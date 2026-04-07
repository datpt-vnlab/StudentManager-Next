"use client";

import { useMemo, useState } from "react";
import {
	extractInitialPassword,
	extractStudentCollection,
	toBackendStudentStatus,
	type MajorOption,
	type StudentRecord,
	type StudentStatus,
} from "@/app/lib/student-registry";

export type Student = StudentRecord;

type ApiError = {
	error?: string;
	errors?: string[];
	message?: string | string[];
};

const statusStyles: Record<Student["status"], string> = {
	Active: "bg-secondary-container text-on-secondary-container",
	Graduated: "bg-surface-container-highest text-on-surface-variant",
	Suspended: "bg-tertiary-container text-on-tertiary-container",
};

type SortKey =
	| "id"
	| "first_name"
	| "last_name"
	| "email"
	| "major"
	| "gender"
	| "birthday"
	| "status"
	| null;
type SortDir = "asc" | "desc";

const sortVal = (s: Student, key: NonNullable<SortKey>) => {
	if (key === "first_name") return s.first_name.toLowerCase();
	if (key === "last_name") return s.last_name.toLowerCase();
	if (key === "major") return (s.major ?? "").toLowerCase();
	if (key === "gender") return (s.gender ?? "").toLowerCase();
	if (key === "birthday") return s.birthday ?? "";
	return String(s[key]).toLowerCase();
};

function formatBirthday(value?: string) {
	if (!value) {
		return "Not set";
	}

	const [year, month, day] = value.split("-");

	if (!year || !month || !day) {
		return value;
	}

	return `${day}/${month}/${year}`;
}

async function getApiErrorMessage(response: Response) {
	try {
		const data = (await response.json()) as ApiError;

		if (typeof data.message === "string" && data.message.trim()) {
			return data.message;
		}

		if (Array.isArray(data.message) && data.message.length > 0) {
			return data.message.join(", ");
		}

		if (typeof data.error === "string" && data.error.trim()) {
			return data.error;
		}

		if (Array.isArray(data.errors) && data.errors.length > 0) {
			return data.errors.join(", ");
		}
	} catch {
		// Ignore invalid JSON and fall back to the HTTP status.
	}

	return response.statusText || "Request failed.";
}

type AddForm = {
	address: string;
	birthday: string;
	email: string;
	first_name: string;
	gender: string;
	last_name: string;
	major_id: string;
	status: StudentStatus;
};

function AddStudentModal({
	isSaving,
	majors,
	onClose,
	onSave,
}: {
	isSaving: boolean;
	majors: MajorOption[];
	onClose: () => void;
	onSave: (data: AddForm) => void | Promise<void>;
}) {
	const [form, setForm] = useState<AddForm>({
		address: "",
		birthday: "",
		email: "",
		first_name: "",
		gender: "",
		last_name: "",
		major_id: "",
		status: "Active",
	});

	const set =
		(k: keyof AddForm) =>
		(
			e: React.ChangeEvent<
				HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
			>,
		) =>
			setForm((prev) => ({ ...prev, [k]: e.target.value }));

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
			<div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
				<div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
					<h2 className="font-headline text-xl font-bold text-indigo-900">
						Add Student
					</h2>
					<button
						type="button"
						onClick={onClose}
						disabled={isSaving}
						className="rounded-full p-2 text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<span className="material-symbols-outlined">close</span>
					</button>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						void onSave(form);
					}}
					className="space-y-5 px-8 py-6"
				>
					<div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-xs font-medium text-indigo-700">
						<span className="material-symbols-outlined text-[16px]">
							info
						</span>
						Student ID will be auto-generated (e.g. STU20260001)
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								First Name
							</label>
							<input
								value={form.first_name}
								onChange={set("first_name")}
								placeholder="Elena"
								required
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Last Name
							</label>
							<input
								value={form.last_name}
								onChange={set("last_name")}
								placeholder="Rodriguez"
								required
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Email
						</label>
						<input
							type="email"
							value={form.email}
							onChange={set("email")}
							placeholder="elena.r@editorial.edu"
							required
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						/>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Major
						</label>
						<select
							value={form.major_id}
							onChange={set("major_id")}
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						>
							<option value="">Select major</option>
							{majors.map((major) => (
								<option key={major.id} value={major.id}>
									{major.name}
								</option>
							))}
						</select>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Gender
							</label>
							<input
								value={form.gender}
								onChange={set("gender")}
								placeholder="Male"
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Birthday
							</label>
							<input
								type="date"
								value={form.birthday}
								onChange={set("birthday")}
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Address
						</label>
						<textarea
							value={form.address}
							onChange={set("address")}
							rows={3}
							placeholder="Street, ward, district, city"
							disabled={isSaving}
							className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						/>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Status
						</label>
						<select
							value={form.status}
							onChange={set("status")}
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						>
							<option>Active</option>
							<option>Suspended</option>
							<option>Graduated</option>
						</select>
					</div>

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							disabled={isSaving}
							className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSaving}
							className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
						>
							{isSaving ? "Adding..." : "Add Student"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

type EditForm = {
	address: string;
	birthday: string;
	email: string;
	first_name: string;
	gender: string;
	last_name: string;
	major_id: string;
	newPassword: string;
	status: StudentStatus;
};

function EditStudentModal({
	isSaving,
	majors,
	onClose,
	onSave,
	student,
}: {
	isSaving: boolean;
	majors: MajorOption[];
	onClose: () => void;
	onSave: (data: EditForm) => void | Promise<void>;
	student: Student;
}) {
	const fallbackMajorId =
		student.major_id ??
		majors.find((major) => major.name === student.major)?.id ??
		"";
	const [form, setForm] = useState<EditForm>({
		address: student.address ?? "",
		birthday: student.birthday ?? "",
		email: student.email,
		first_name: student.first_name,
		gender: student.gender ?? "",
		last_name: student.last_name,
		major_id: fallbackMajorId,
		newPassword: "",
		status: student.status,
	});

	const set =
		(k: keyof EditForm) =>
		(
			e: React.ChangeEvent<
				HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
			>,
		) =>
			setForm((prev) => ({ ...prev, [k]: e.target.value }));

	const resetPassword = () =>
		setForm((prev) => ({ ...prev, newPassword: student.id }));

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
			<div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
				<div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-8 py-6">
					<div>
						<h2 className="font-headline text-xl font-bold text-indigo-900">
							Edit Student
						</h2>
						<p className="mt-0.5 font-mono text-xs text-slate-400">
							{student.id}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={isSaving}
						className="rounded-full p-2 text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<span className="material-symbols-outlined">close</span>
					</button>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						void onSave(form);
					}}
					className="space-y-5 px-8 py-6"
				>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								First Name
							</label>
							<input
								value={form.first_name}
								onChange={set("first_name")}
								required
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Last Name
							</label>
							<input
								value={form.last_name}
								onChange={set("last_name")}
								required
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Email
						</label>
						<input
							type="email"
							value={form.email}
							onChange={set("email")}
							required
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						/>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Major
						</label>
						<select
							value={form.major_id}
							onChange={set("major_id")}
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						>
							<option value="">Select major</option>
							{majors.map((major) => (
								<option key={major.id} value={major.id}>
									{major.name}
								</option>
							))}
						</select>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Gender
							</label>
							<input
								value={form.gender}
								onChange={set("gender")}
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Birthday
							</label>
							<input
								type="date"
								value={form.birthday}
								onChange={set("birthday")}
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Address
						</label>
						<textarea
							value={form.address}
							onChange={set("address")}
							rows={3}
							disabled={isSaving}
							className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						/>
					</div>

					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Status
						</label>
						<select
							value={form.status}
							onChange={set("status")}
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						>
							<option>Active</option>
							<option>Suspended</option>
							<option>Graduated</option>
						</select>
					</div>

					<div className="space-y-3 border-t border-slate-100 pt-2">
						<p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Password
						</p>
						<div className="space-y-1.5">
							<div className="flex items-center justify-between">
								<label className="text-xs text-slate-500">
									New password
								</label>
								<button
									type="button"
									onClick={resetPassword}
									disabled={isSaving}
									className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 transition-colors hover:text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
								>
									<span className="material-symbols-outlined text-[14px]">
										restart_alt
									</span>
									Reset to Student ID
								</button>
							</div>
							<input
								type="text"
								value={form.newPassword}
								onChange={set("newPassword")}
								placeholder="Leave blank to keep current password"
								disabled={isSaving}
								className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
							/>
							{form.newPassword === student.id && (
								<p className="flex items-center gap-1 text-[11px] text-amber-600">
									<span className="material-symbols-outlined text-[13px]">
										warning
									</span>
									Password will be reset to student ID
									(default)
								</p>
							)}
						</div>
					</div>

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							disabled={isSaving}
							className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSaving}
							className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
						>
							{isSaving ? "Saving..." : "Save Changes"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

type ModalState =
	| { mode: "closed" }
	| { mode: "add" }
	| { mode: "edit"; student: Student };

type FlashState =
	| { kind: "error"; message: string }
	| { kind: "success"; message: string }
	| null;

export default function StudentTable({
	majors,
	students: initial,
}: {
	majors: MajorOption[];
	students: Student[];
}) {
	const [students, setStudents] = useState(initial);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>(null);
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [modal, setModal] = useState<ModalState>({ mode: "closed" });
	const [isMutating, setIsMutating] = useState(false);
	const [flash, setFlash] = useState<FlashState>(null);

	const filtered = useMemo(() => {
		let list = students;

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(s) =>
					s.first_name.toLowerCase().includes(q) ||
					s.last_name.toLowerCase().includes(q) ||
					s.email.toLowerCase().includes(q) ||
					(s.major ?? "").toLowerCase().includes(q) ||
					(s.gender ?? "").toLowerCase().includes(q) ||
					(s.address ?? "").toLowerCase().includes(q) ||
					s.id.toLowerCase().includes(q),
			);
		}

		if (sortKey) {
			list = [...list].sort((a, b) => {
				const av = sortVal(a, sortKey);
				const bv = sortVal(b, sortKey);

				return sortDir === "asc"
					? av.localeCompare(bv)
					: bv.localeCompare(av);
			});
		}

		return list;
	}, [students, search, sortDir, sortKey]);

	const toggleSort = (key: SortKey) => {
		if (!key) return;

		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
			return;
		}

		setSortKey(key);
		setSortDir("asc");
	};

	const refreshStudents = async () => {
		const response = await fetch("/api/students", {
			cache: "no-store",
		});

		if (!response.ok) {
			throw new Error(await getApiErrorMessage(response));
		}

		const payload = (await response.json().catch(() => null)) as unknown;
		setStudents(extractStudentCollection(payload as never));
	};

	const handleAdd = async (data: AddForm) => {
		setFlash(null);
		setIsMutating(true);

		try {
			const response = await fetch("/api/students", {
				body: JSON.stringify({
					address: data.address || undefined,
					birthday: data.birthday || undefined,
					email: data.email,
					first_name: data.first_name,
					gender: data.gender || undefined,
					last_name: data.last_name,
					major_id: data.major_id || undefined,
					status: toBackendStudentStatus(data.status),
				}),
				headers: {
					"Content-Type": "application/json",
				},
				method: "POST",
			});

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			const payload = (await response.json().catch(() => null)) as unknown;
			await refreshStudents();
			setModal({ mode: "closed" });

			const initialPassword = extractInitialPassword(payload);

			setFlash({
				kind: "success",
				message: initialPassword
					? `Student created. Initial password: ${initialPassword}`
					: "Student created successfully.",
			});
		} catch (error) {
			setFlash({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to create student.",
			});
		} finally {
			setIsMutating(false);
		}
	};

	const handleEdit = async (data: EditForm) => {
		if (modal.mode !== "edit") return;

		setFlash(null);
		setIsMutating(true);

		try {
			const payload = {
				address: data.address || undefined,
				birthday: data.birthday || undefined,
				email: data.email,
				first_name: data.first_name,
				gender: data.gender || undefined,
				last_name: data.last_name,
				major_id: data.major_id || undefined,
				password_hash: data.newPassword.trim() || undefined,
				status: toBackendStudentStatus(data.status),
			};
			const response = await fetch(`/api/students/${modal.student.id}`, {
				body: JSON.stringify(payload),
				headers: {
					"Content-Type": "application/json",
				},
				method: "PATCH",
			});

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			await refreshStudents();
			setModal({ mode: "closed" });
			setFlash({
				kind: "success",
				message: "Student updated successfully.",
			});
		} catch (error) {
			setFlash({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to update student.",
			});
		} finally {
			setIsMutating(false);
		}
	};

	const handleDelete = async (student: Student) => {
		if (isMutating) return;

		const confirmed = window.confirm(
			`Delete ${student.first_name} ${student.last_name} (${student.id})?`,
		);

		if (!confirmed) {
			return;
		}

		setFlash(null);
		setIsMutating(true);

		try {
			const response = await fetch(`/api/students/${student.id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			await refreshStudents();
			setFlash({
				kind: "success",
				message: "Student deleted successfully.",
			});
		} catch (error) {
			setFlash({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to delete student.",
			});
		} finally {
			setIsMutating(false);
		}
	};

	const SortIcon = ({ col }: { col: SortKey }) =>
		sortKey === col ? (
			<span className="material-symbols-outlined text-[13px] text-primary">
				{sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
			</span>
		) : (
			<span className="material-symbols-outlined text-[13px] text-slate-300">
				unfold_more
			</span>
		);

	const columns: { key: SortKey; label: string }[] = [
		{ key: "id", label: "ID" },
		{ key: "last_name", label: "Full Name" },
		{ key: "major", label: "Major" },
		{ key: "email", label: "Contact" },
		{ key: "gender", label: "Gender" },
		{ key: "birthday", label: "Birthday" },
		{ key: "status", label: "Status" },
		{ key: null, label: "Actions" },
	];

	return (
		<>
			{modal.mode === "add" && (
				<AddStudentModal
					isSaving={isMutating}
					majors={majors}
					onSave={handleAdd}
					onClose={() => setModal({ mode: "closed" })}
				/>
			)}
			{modal.mode === "edit" && (
				<EditStudentModal
					isSaving={isMutating}
					majors={majors}
					student={modal.student}
					onSave={handleEdit}
					onClose={() => setModal({ mode: "closed" })}
				/>
			)}

			<div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm ring-1 ring-slate-200/50">
				<div className="flex items-center gap-4 border-b border-slate-50 bg-white px-8 py-5">
					<h3 className="shrink-0 font-headline font-bold text-indigo-900">
						Current Enrollment
					</h3>
					<div className="relative ml-auto max-w-xs flex-1">
						<span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-slate-400">
							search
						</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search students…"
							className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<button
						type="button"
						onClick={() => {
							setFlash(null);
							setModal({ mode: "add" });
						}}
						disabled={isMutating}
						className="press-effect flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow shadow-primary/20 transition-transform disabled:cursor-not-allowed disabled:opacity-70"
					>
						<span className="material-symbols-outlined text-[18px]">
							person_add
						</span>
						<span>Add Student</span>
					</button>
				</div>

				{flash && (
					<div className="border-b border-slate-100 bg-white px-8 py-4">
						<p
							className={`rounded-lg px-4 py-3 text-sm ${
								flash.kind === "error"
									? "border border-red-200 bg-red-50 text-red-700"
									: "border border-emerald-200 bg-emerald-50 text-emerald-700"
							}`}
						>
							{flash.message}
						</p>
					</div>
				)}

				<div className="overflow-x-auto">
					<table className="min-w-[1100px] w-full border-collapse text-left">
						<thead>
							<tr className="bg-slate-50/50">
								{columns.map(({ key, label }) => (
									<th
										key={label}
										onClick={() => toggleSort(key)}
										className={`px-8 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 ${label === "Actions" ? "text-right" : ""} ${key ? "cursor-pointer select-none hover:text-indigo-700" : ""}`}
									>
										<span
											className={`inline-flex items-center gap-1 whitespace-nowrap ${label === "Actions" ? "justify-end" : "justify-start"}`}
										>
											{key && <SortIcon col={key} />}
											<span>{label}</span>
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
						{filtered.length === 0 ? (
							<tr>
								<td
									colSpan={8}
									className="px-8 py-12 text-center text-sm text-slate-400"
								>
									No students match your search.
								</td>
							</tr>
						) : (
							filtered.map((student) => (
								<tr
									key={student.id}
									className="group transition-colors hover:bg-slate-50/80"
								>
									<td className="px-8 py-5 font-mono text-xs font-medium text-slate-600">
										{student.id}
									</td>
									<td className="px-8 py-5 font-label font-semibold text-slate-900">
										{student.first_name} {student.last_name}
									</td>
									<td className="px-8 py-5 text-sm text-slate-600">
										{student.major || "Not set"}
									</td>
									<td className="px-8 py-5 text-sm text-slate-600">
										<div>{student.email}</div>
										{student.address && (
											<div className="mt-1 max-w-xs text-xs text-slate-400">
												{student.address}
											</div>
										)}
									</td>
									<td className="px-8 py-5 text-sm text-slate-600">
										{student.gender || "Not set"}
									</td>
									<td className="px-8 py-5 text-sm text-slate-600">
										{formatBirthday(student.birthday)}
									</td>
									<td className="px-8 py-5">
										<span
											className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${statusStyles[student.status]}`}
										>
											{student.status}
										</span>
									</td>
									<td className="px-8 py-5 text-right">
										<div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
											<button
												type="button"
												onClick={() => {
													setFlash(null);
													setModal({
														mode: "edit",
														student,
													});
												}}
												disabled={isMutating}
												className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
												title="Edit student"
											>
												<span className="material-symbols-outlined text-lg">
													edit_square
												</span>
											</button>
											<button
												type="button"
												onClick={() =>
													void handleDelete(student)
												}
												disabled={isMutating}
												className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
												title="Delete student"
											>
												<span className="material-symbols-outlined text-lg">
													delete
												</span>
											</button>
										</div>
									</td>
								</tr>
							))
						)}
						</tbody>
					</table>
				</div>

				<div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-8 py-4">
					<p className="text-xs font-medium text-slate-500">
						Showing {filtered.length} of {students.length} students
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled
							className="p-2 text-slate-400 disabled:opacity-30"
						>
							<span className="material-symbols-outlined">
								chevron_left
							</span>
						</button>
						<button
							type="button"
							disabled
							className="p-2 text-slate-400 disabled:opacity-30"
						>
							<span className="material-symbols-outlined">
								chevron_right
							</span>
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
