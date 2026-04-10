"use client";

import SectionCard from "@/app/ui/settings/section-card";
import SettingRow from "@/app/ui/settings/setting-row";

export default function SecuritySection({
	sessionTimeout,
	onSessionTimeoutChange,
}: {
	sessionTimeout: string;
	onSessionTimeoutChange: (v: string) => void;
}) {
	return (
		<SectionCard
			icon="security"
			title="Security"
			description="Control session duration for the authenticated administrator."
		>
			<SettingRow
				label="Session Timeout"
				hint="You are logged out after this period of inactivity"
			>
				<select
					value={sessionTimeout}
					onChange={(e) => onSessionTimeoutChange(e.target.value)}
					className="w-40 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
				>
					<option value="15">15 minutes</option>
					<option value="30">30 minutes</option>
					<option value="45">45 minutes</option>
					<option value="60">1 hour</option>
					<option value="480">8 hours</option>
				</select>
			</SettingRow>
		</SectionCard>
	);
}
