"use client";

import { useState } from "react";
import SecuritySection from "@/app/ui/settings/security-section";
import FaceIdSection from "@/app/ui/settings/face-id-section";

export default function SettingsPanel() {
	const [sessionTimeout, setSessionTimeout] = useState("30");
	const [requireOtp, setRequireOtp] = useState(true);
	const [faceIdEnabled, setFaceIdEnabled] = useState(false);
	const [enrolledCount] = useState(0); // TODO: fetch from /face-id/enrolled

	const [saved, setSaved] = useState(false);

	const handleSave = () => {
		// TODO: PATCH /settings
		setSaved(true);
		setTimeout(() => setSaved(false), 2500);
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<SecuritySection
				sessionTimeout={sessionTimeout}
				onSessionTimeoutChange={setSessionTimeout}
				requireOtp={requireOtp}
				onRequireOtpChange={setRequireOtp}
			/>

			<FaceIdSection
				enabled={faceIdEnabled}
				onEnabledChange={setFaceIdEnabled}
				enrolledCount={enrolledCount}
			/>

			{/* Save */}
			<div className="flex items-center gap-4">
				<button
					type="button"
					onClick={handleSave}
					className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow shadow-primary/20 hover:bg-primary/90 transition-colors"
				>
					<span className="material-symbols-outlined text-[18px]">
						save
					</span>
					Save Settings
				</button>
				{saved && (
					<span className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold">
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
