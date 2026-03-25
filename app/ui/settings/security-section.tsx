"use client";

import SectionCard from "@/app/ui/settings/section-card";
import SettingRow from "@/app/ui/settings/setting-row";
import Toggle from "@/app/ui/settings/toggle";

export default function SecuritySection({
	sessionTimeout,
	onSessionTimeoutChange,
	requireOtp,
	onRequireOtpChange,
}: {
	sessionTimeout: string;
	onSessionTimeoutChange: (v: string) => void;
	requireOtp: boolean;
	onRequireOtpChange: (v: boolean) => void;
}) {
	return (
		<SectionCard
			icon="security"
			title="Security"
			description="Control session and authentication requirements."
		>
			<SettingRow
				label="Session Timeout"
				hint="Admins are logged out after this period of inactivity"
			>
				<select
					value={sessionTimeout}
					onChange={(e) => onSessionTimeoutChange(e.target.value)}
					className="w-40 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
				>
					<option value="15">15 minutes</option>
					<option value="30">30 minutes</option>
					<option value="60">1 hour</option>
					<option value="480">8 hours</option>
				</select>
			</SettingRow>
			<SettingRow
				label="Require OTP every session"
				hint="Admins must verify via OTP on each new login"
			>
				<Toggle checked={requireOtp} onChange={onRequireOtpChange} />
			</SettingRow>
		</SectionCard>
	);
}
