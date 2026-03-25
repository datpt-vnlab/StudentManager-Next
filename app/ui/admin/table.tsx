"use client";

import { useState, useMemo } from "react";

export type Admin = {
	id: string;
	name: string;
	email: string;
};

type SortKey = keyof Admin | null;
type SortDir = "asc" | "desc";

// ── Modal ────────────────────────────────────────────────────────────────────

function AdminModal({
	admin,
	onSave,
	onClose,
}: {
	admin: Partial<Admin>;
	onSave: (data: Admin) => void;
	onClose: () => void;
}) {
	const isEdit = !!admin.id;
	const [form, setForm] = useState({
		id: admin.id ?? "",
		name: admin.name ?? "",
		email: admin.email ?? "",
	});

	const set =
		(k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
			setForm((prev) => ({ ...prev, [k]: e.target.value }));

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSave(form as Admin);
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
				{/* Header */}
				<div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
							<span className="material-symbols-outlined text-primary text-[20px]">
								shield_person
							</span>
						</div>
						<h2 className="font-headline font-bold text-xl text-indigo-900">
							{isEdit
								? "Edit Admin Account"
								: "Add Admin Account"}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="p-2 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
					>
						<span className="material-symbols-outlined">close</span>
					</button>
				</div>

				<form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
					{!isEdit && (
						<div className="space-y-1.5">
							<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
								Admin ID
							</label>
							<input
								value={form.id}
								onChange={set("id")}
								placeholder="#AD-001"
								required
								className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
							/>
						</div>
					)}
					<div className="space-y-1.5">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
							Full Name
						</label>
						<input
							value={form.name}
							onChange={set("name")}
							placeholder="e.g. Dr. John Carter"
							required
							className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
							className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
						>
							Cancel
						</button>
						<button
							type="submit"
							className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
						>
							{isEdit ? "Save Changes" : "Add Admin"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ── Table ────────────────────────────────────────────────────────────────────

export default function AdminTable({ admins: initial }: { admins: Admin[] }) {
	const [admins, setAdmins] = useState(initial);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>(null);
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [modal, setModal] = useState<Partial<Admin> | null>(null);

	const filtered = useMemo(() => {
		let list = admins;
		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(a) =>
					a.name.toLowerCase().includes(q) ||
					a.email.toLowerCase().includes(q) ||
					a.id.toLowerCase().includes(q),
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
	}, [admins, search, sortKey, sortDir]);

	const toggleSort = (key: SortKey) => {
		if (!key) return;
		if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		else {
			setSortKey(key);
			setSortDir("asc");
		}
	};

	const handleSave = (data: Admin) => {
		setAdmins((prev) =>
			prev.find((a) => a.id === data.id)
				? prev.map((a) => (a.id === data.id ? data : a))
				: [...prev, data],
		);
		setModal(null);
	};

	const SortIcon = ({ col }: { col: SortKey }) =>
		sortKey === col ? (
			<span className="material-symbols-outlined text-[13px] ml-0.5 text-primary align-middle">
				{sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
			</span>
		) : (
			<span className="material-symbols-outlined text-[13px] ml-0.5 text-slate-300 align-middle">
				unfold_more
			</span>
		);

	const columns: { label: string; key: SortKey }[] = [
		{ label: "ID", key: "id" },
		{ label: "Full Name", key: "name" },
		{ label: "Email", key: "email" },
		{ label: "Actions", key: null },
	];

	return (
		<>
			{modal !== null && (
				<AdminModal
					admin={modal}
					onSave={handleSave}
					onClose={() => setModal(null)}
				/>
			)}

			<div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-200/50">
				{/* Toolbar */}
				<div className="px-8 py-5 flex items-center gap-4 bg-white border-b border-slate-50">
					<h3 className="font-headline font-bold text-indigo-900 shrink-0">
						Admin Accounts
					</h3>
					<div className="relative flex-1 max-w-xs ml-auto">
						<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
							search
						</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search admins…"
							className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<button
						onClick={() => setModal({})}
						className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm shadow shadow-primary/20 press-effect transition-transform shrink-0"
					>
						<span className="material-symbols-outlined text-[18px]">
							person_add
						</span>
						<span>Add Admin</span>
					</button>
				</div>

				<table className="w-full text-left border-collapse">
					<thead>
						<tr className="bg-slate-50/50">
							{columns.map(({ label, key }) => (
								<th
									key={label}
									onClick={() => toggleSort(key)}
									className={`px-8 py-4 text-[11px] uppercase tracking-widest font-bold text-slate-500 ${label === "Actions" ? "text-right" : ""} ${key ? "cursor-pointer hover:text-indigo-700 select-none" : ""}`}
								>
									{label}
									{key && <SortIcon col={key} />}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{filtered.length === 0 ? (
							<tr>
								<td
									colSpan={4}
									className="px-8 py-12 text-center text-slate-400 text-sm"
								>
									No admins match your search.
								</td>
							</tr>
						) : (
							filtered.map((admin) => (
								<tr
									key={admin.id}
									className="group hover:bg-slate-50/80 transition-colors"
								>
									<td className="px-8 py-5 font-mono text-xs text-slate-600 font-medium">
										{admin.id}
									</td>
									<td className="px-8 py-5 font-label font-semibold text-slate-900">
										{admin.name}
									</td>
									<td className="px-8 py-5 text-sm text-slate-600">
										{admin.email}
									</td>
									<td className="px-8 py-5 text-right">
										<div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												onClick={() => setModal(admin)}
												className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
											>
												<span className="material-symbols-outlined text-lg">
													edit_square
												</span>
											</button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>

				{/* Pagination */}
				<div className="px-8 py-4 bg-slate-50/30 border-t border-slate-100 flex items-center justify-between">
					<p className="text-xs text-slate-500 font-medium">
						Showing {filtered.length} of {admins.length} admins
					</p>
					<div className="flex items-center gap-2">
						<button
							disabled
							className="p-2 text-slate-400 hover:text-indigo-600 disabled:opacity-30"
						>
							<span className="material-symbols-outlined">
								chevron_left
							</span>
						</button>
						<button className="p-2 text-slate-400 hover:text-indigo-600">
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
