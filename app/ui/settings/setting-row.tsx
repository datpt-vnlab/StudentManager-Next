import type { ReactNode } from "react";

export default function SettingRow({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-8">
			<div className="min-w-0">
				<p className="text-sm font-semibold text-slate-800">{label}</p>
				{hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}
