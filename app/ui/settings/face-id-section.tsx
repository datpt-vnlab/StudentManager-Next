"use client";

import SectionCard from "@/app/ui/settings/section-card";
import SettingRow from "@/app/ui/settings/setting-row";
import Toggle from "@/app/ui/settings/toggle";

export default function FaceIdSection({
	enabled,
	onEnabledChange,
	enrolledCount,
}: {
	enabled: boolean;
	onEnabledChange: (v: boolean) => void;
	enrolledCount: number;
}) {
	return (
		<SectionCard
			icon="face_retouching_natural"
			title="Face ID Authentication"
			description="Allow administrators to sign in using facial recognition."
		>
			<SettingRow
				label="Enable Face ID Login"
				hint="Shows the Face ID option on the admin login screen"
			>
				<Toggle checked={enabled} onChange={onEnabledChange} />
			</SettingRow>

			{enabled && (
				<>
					<div className="h-px bg-slate-100" />
					<SettingRow
						label="Enrolled faces"
						hint="Administrators with a registered face profile"
					>
						<span className="text-sm font-bold text-slate-700">
							{enrolledCount}
						</span>
					</SettingRow>
					<div className="flex items-center gap-3">
						<button
							type="button"
							className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors"
						>
							<span className="material-symbols-outlined text-[18px]">
								add_a_photo
							</span>
							Enroll New Face
						</button>
						{enrolledCount > 0 && (
							<button
								type="button"
								className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 text-sm font-semibold hover:bg-slate-100 transition-colors"
							>
								<span className="material-symbols-outlined text-[18px]">
									manage_accounts
								</span>
								Manage Enrolled
							</button>
						)}
					</div>
					<p className="text-[11px] text-slate-400 flex items-center gap-1.5">
						<span className="material-symbols-outlined text-[14px]">
							info
						</span>
						Face data is stored securely and never shared outside
						this system. Requires backend integration.
					</p>
				</>
			)}
		</SectionCard>
	);
}
