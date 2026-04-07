"use client";

import { useState } from "react";

type ApiError = {
	message?: string | string[];
	error?: string;
	errors?: string[];
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
		// Ignore invalid JSON and fall back to the status text.
	}

	return response.statusText || "Request failed.";
}

export default function ChangePasswordForm({
	email,
}: {
	email: string;
}) {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setErrorMessage("");
		setSuccessMessage("");

		if (!current || !next || !confirm) {
			setErrorMessage("Fill in all password fields.");
			return;
		}

		if (next !== confirm) {
			setErrorMessage("New password confirmation does not match.");
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await fetch("/api/student/me", {
				body: JSON.stringify({
					currentPassword: current,
					email,
					newPassword: next,
				}),
				cache: "no-store",
				headers: {
					"Content-Type": "application/json",
				},
				method: "PATCH",
			});

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			setCurrent("");
			setNext("");
			setConfirm("");
			setSuccessMessage("Password updated successfully.");
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to update password.",
			);
		} finally {
			setIsSubmitting(false);
		}
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
						disabled={isSubmitting}
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
						disabled={isSubmitting}
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
						disabled={isSubmitting}
						placeholder="••••••••"
						className="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:bg-surface-container-lowest transition-all"
					/>
				</div>
				{errorMessage && (
					<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{errorMessage}
					</p>
				)}
				{successMessage && (
					<p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						{successMessage}
					</p>
				)}
				<button
					type="submit"
					disabled={isSubmitting}
					className="w-full py-3 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary-container transition-colors shadow-lg shadow-primary/10 mt-2"
				>
					{isSubmitting ? "Updating..." : "Update Password"}
				</button>
			</form>
		</section>
	);
}
