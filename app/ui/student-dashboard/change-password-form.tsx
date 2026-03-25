"use client";

// "use client" because the form needs controlled inputs (useState)
// In the future, replace the onSubmit handler with a Server Action call
import { useState } from "react";

export default function ChangePasswordForm() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		// TODO: call a Server Action or POST /api/student/password
		console.log("Password change submitted");
	}

	return (
		<section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm h-full">
			<div className="flex items-center gap-3 mb-6">
				<span className="material-symbols-outlined text-primary">
					lock_reset
				</span>
				<h4 className="font-headline text-lg font-bold text-on-surface">
					Security Settings
				</h4>
			</div>

			<form onSubmit={handleSubmit} className="space-y-5">
				<div>
					<label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
						Current Password
					</label>
					<input
						type="password"
						value={current}
						onChange={(e) => setCurrent(e.target.value)}
						placeholder="••••••••"
						className="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:bg-surface-container-lowest transition-all"
					/>
				</div>
				<div>
					<label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
						New Password
					</label>
					<input
						type="password"
						value={next}
						onChange={(e) => setNext(e.target.value)}
						placeholder="Minimum 8 characters"
						className="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:bg-surface-container-lowest transition-all"
					/>
				</div>
				<div>
					<label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
						Confirm New Password
					</label>
					<input
						type="password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						placeholder="••••••••"
						className="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:bg-surface-container-lowest transition-all"
					/>
				</div>
				<button
					type="submit"
					className="w-full py-3 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary-container transition-colors shadow-lg shadow-primary/10 mt-2"
				>
					Update Password
				</button>
			</form>
		</section>
	);
}
