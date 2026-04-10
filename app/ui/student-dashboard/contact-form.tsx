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

export default function ContactForm({
	address: initialAddress,
	email: initialEmail,
}: {
	address?: string;
	email: string;
}) {
	const [address, setAddress] = useState(initialAddress ?? "");
	const [email, setEmail] = useState(initialEmail);
	const [isEditing, setIsEditing] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setErrorMessage("");
		setSuccessMessage("");

		if (!email.trim()) {
			setErrorMessage("Email is required.");
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await fetch("/api/student/me", {
				body: JSON.stringify({
					address: address.trim() || "",
					email: email.trim(),
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

			setIsEditing(false);
			setSuccessMessage("Profile updated successfully.");
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to update profile.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="rounded-xl bg-surface-container-lowest p-8 shadow-sm">
			<div className="mb-6 flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span className="material-symbols-outlined text-primary">
						mail
					</span>
					<h4 className="font-headline text-lg font-bold text-on-surface">
						Contact Details
					</h4>
				</div>
				<button
					type="button"
					onClick={() => {
						setErrorMessage("");
						setSuccessMessage("");
						setEmail(initialEmail);
						setAddress(initialAddress ?? "");
						setIsEditing((value) => !value);
					}}
					disabled={isSubmitting}
					className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span className="material-symbols-outlined text-[18px]">
						edit_square
					</span>
					{isEditing ? "Cancel" : "Edit"}
				</button>
			</div>

			<form onSubmit={handleSubmit} className="space-y-5">
				<div>
					<label className="mb-2 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
						Email Address
					</label>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={!isEditing || isSubmitting}
						className="w-full rounded-lg border-none bg-surface-container-highest px-4 py-3 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/40 disabled:cursor-default disabled:opacity-80"
					/>
				</div>
				<div>
					<label className="mb-2 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
						Address
					</label>
					<textarea
						value={address}
						onChange={(e) => setAddress(e.target.value)}
						disabled={!isEditing || isSubmitting}
						rows={4}
						placeholder="Street, ward, district, city"
						className="w-full resize-none rounded-lg border-none bg-surface-container-highest px-4 py-3 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/40 disabled:cursor-default disabled:opacity-80"
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
				{isEditing && (
					<button
						type="submit"
						disabled={isSubmitting}
						className="mt-2 w-full rounded-lg bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/10 transition-colors hover:bg-primary-container"
					>
						{isSubmitting ? "Saving..." : "Save Contact Details"}
					</button>
				)}
			</form>
		</section>
	);
}
