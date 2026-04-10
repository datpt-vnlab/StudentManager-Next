"use client";

import { useMemo, useState } from "react";
import type { AdminAccount } from "@/app/lib/admin-management";

export type Admin = AdminAccount;

type ApiError = {
	error?: string;
	errors?: string[];
	message?: string | string[];
};

type SortKey = "name" | "email" | null;
type SortDir = "asc" | "desc";

type AdminForm = {
	email: string;
	name: string;
};

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

function AdminModal({
	admin,
	isSaving,
	onClose,
	onSave,
}: {
	admin: Partial<Admin>;
	isSaving: boolean;
	onClose: () => void;
	onSave: (data: AdminForm) => void | Promise<void>;
}) {
	const isEdit = Boolean(admin.id);
	const [form, setForm] = useState<AdminForm>({
		email: admin.email ?? "",
		name: admin.name ?? "",
	});

	const set =
		(k: keyof AdminForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
			setForm((prev) => ({ ...prev, [k]: e.target.value }));

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
				<div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
							<span className="material-symbols-outlined text-[20px] text-primary">
								shield_person
							</span>
						</div>
						<h2 className="font-headline text-xl font-bold text-indigo-900">
							{isEdit ? "Edit Admin Account" : "Add Admin Account"}
						</h2>
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
					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Full Name
						</label>
						<input
							value={form.name}
							onChange={set("name")}
							placeholder="e.g. Dr. John Carter"
							required
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Email
						</label>
						<input
							type="email"
							value={form.email}
							onChange={set("email")}
							placeholder="admin@editorial.edu"
							required
							disabled={isSaving}
							className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
						/>
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
							{isSaving ? "Saving..." : isEdit ? "Save Changes" : "Add Admin"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

type FlashState =
	| { kind: "error"; message: string }
	| { kind: "success"; message: string }
	| null;

export default function AdminTable({ admins: initial }: { admins: Admin[] }) {
	const [admins, setAdmins] = useState(initial);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>(null);
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [modal, setModal] = useState<Partial<Admin> | null>(null);
	const [isMutating, setIsMutating] = useState(false);
	const [flash, setFlash] = useState<FlashState>(null);

	const filtered = useMemo(() => {
		let list = admins;

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(a) =>
					a.name.toLowerCase().includes(q) ||
					a.email.toLowerCase().includes(q),
			);
		}

		if (sortKey) {
			list = [...list].sort((a, b) => {
				const av = String(a[sortKey]).toLowerCase();
				const bv = String(b[sortKey]).toLowerCase();

				return sortDir === "asc"
					? av.localeCompare(bv)
					: bv.localeCompare(av);
			});
		}

		return list;
	}, [admins, search, sortDir, sortKey]);

	const toggleSort = (key: SortKey) => {
		if (!key) return;
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
			return;
		}
		setSortKey(key);
		setSortDir("asc");
	};

	const refreshAdmins = async () => {
		const response = await fetch("/api/admins", {
			cache: "no-store",
		});

		if (!response.ok) {
			throw new Error(await getApiErrorMessage(response));
		}

		const payload = (await response.json().catch(() => null)) as {
			admins?: Admin[];
			data?: Admin[];
		} | Admin[] | null;
		const list = Array.isArray(payload)
			? payload
			: Array.isArray(payload?.admins)
				? payload.admins
				: Array.isArray(payload?.data)
					? payload.data
					: [];

		setAdmins(list);
	};

	const handleSave = async (data: AdminForm) => {
		setFlash(null);
		setIsMutating(true);

		try {
			const isEdit = Boolean(modal?.id);
			const response = await fetch(
				isEdit ? `/api/admins/${modal?.id}` : "/api/admins",
				{
					body: JSON.stringify(data),
					headers: {
						"Content-Type": "application/json",
					},
					method: isEdit ? "PATCH" : "POST",
				},
			);

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			await refreshAdmins();
			setModal(null);
			setFlash({
				kind: "success",
				message: isEdit
					? "Admin updated successfully."
					: "Admin created successfully.",
			});
		} catch (error) {
			setFlash({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to save admin account.",
			});
		} finally {
			setIsMutating(false);
		}
	};

	const handleDelete = async (admin: Admin) => {
		if (isMutating) return;

		const confirmed = window.confirm(
			`Delete admin account for ${admin.name}?`,
		);

		if (!confirmed) {
			return;
		}

		setFlash(null);
		setIsMutating(true);

		try {
			const response = await fetch(`/api/admins/${admin.id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			await refreshAdmins();
			setFlash({
				kind: "success",
				message: "Admin deleted successfully.",
			});
		} catch (error) {
			setFlash({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to delete admin account.",
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
		{ key: "name", label: "Full Name" },
		{ key: "email", label: "Email" },
		{ key: null, label: "Actions" },
	];

	return (
		<>
			{modal !== null && (
				<AdminModal
					admin={modal}
					isSaving={isMutating}
					onSave={handleSave}
					onClose={() => setModal(null)}
				/>
			)}

			<div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm ring-1 ring-slate-200/50">
				<div className="flex items-center gap-4 border-b border-slate-50 bg-white px-8 py-5">
					<h3 className="shrink-0 font-headline font-bold text-indigo-900">
						Admin Accounts
					</h3>
					<div className="relative ml-auto max-w-xs flex-1">
						<span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-slate-400">
							search
						</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search admins…"
							className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<button
						type="button"
						onClick={() => {
							setFlash(null);
							setModal({});
						}}
						disabled={isMutating}
						className="press-effect flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow shadow-primary/20 transition-transform disabled:cursor-not-allowed disabled:opacity-70"
					>
						<span className="material-symbols-outlined text-[18px]">
							person_add
						</span>
						<span>Add Admin</span>
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

				<table className="w-full border-collapse text-left">
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
									colSpan={3}
									className="px-8 py-12 text-center text-sm text-slate-400"
								>
									No admins match your search.
								</td>
							</tr>
						) : (
							filtered.map((admin) => (
								<tr
									key={admin.id}
									className="group transition-colors hover:bg-slate-50/80"
								>
									<td className="px-8 py-5 font-label font-semibold text-slate-900">
										{admin.name}
									</td>
									<td className="px-8 py-5 text-sm text-slate-600">
										{admin.email}
									</td>
									<td className="px-8 py-5 text-right">
										<div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
											<button
												type="button"
												onClick={() => setModal(admin)}
												disabled={isMutating}
												className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
												title="Edit admin"
											>
												<span className="material-symbols-outlined text-lg">
													edit_square
												</span>
											</button>
											<button
												type="button"
												onClick={() => void handleDelete(admin)}
												disabled={isMutating}
												className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
												title="Delete admin"
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

				<div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-8 py-4">
					<p className="text-xs font-medium text-slate-500">
						Showing {filtered.length} of {admins.length} admins
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
