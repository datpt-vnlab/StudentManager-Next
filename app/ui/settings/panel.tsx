"use client";

import { useState } from "react";
import type { AdminSettings } from "@/app/lib/admin-management";
import FaceIdSection from "@/app/ui/settings/face-id-section";
import SecuritySection from "@/app/ui/settings/security-section";

type ApiError = {
	error?: string;
	errors?: string[];
	message?: string | string[];
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

export default function SettingsPanel({
	initialSettings,
}: {
	initialSettings: AdminSettings;
}) {
	const [sessionTimeout, setSessionTimeout] = useState(
		String(initialSettings.session_timeout),
	);
	const [errorMessage, setErrorMessage] = useState("");
	const [saved, setSaved] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = async () => {
		setErrorMessage("");
		setSaved(false);
		setIsSaving(true);

		try {
			const response = await fetch("/api/settings", {
				body: JSON.stringify({
					session_timeout: Number(sessionTimeout),
				}),
				headers: {
					"Content-Type": "application/json",
				},
				method: "PATCH",
			});

			if (!response.ok) {
				throw new Error(await getApiErrorMessage(response));
			}

			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to save settings.",
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="max-w-2xl space-y-6">
			<SecuritySection
				sessionTimeout={sessionTimeout}
				onSessionTimeoutChange={setSessionTimeout}
			/>

			<FaceIdSection />

			{errorMessage && (
				<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{errorMessage}
				</p>
			)}

			<div className="flex items-center gap-4">
				<button
					type="button"
					onClick={handleSave}
					disabled={isSaving}
					className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
				>
					<span className="material-symbols-outlined text-[18px]">
						save
					</span>
					{isSaving ? "Saving..." : "Save Settings"}
				</button>
				{saved && (
					<span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
						<span className="material-symbols-outlined text-[18px]">
							check_circle
						</span>
						Saved successfully
					</span>
				)}
			</div>
		</div>
	);
}
