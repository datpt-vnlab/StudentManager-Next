import type { ReactNode } from "react";

export default function SectionCard({
	icon,
	title,
	description,
	children,
}: {
	icon: string;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<div className="bg-white rounded-xl ring-1 ring-slate-200/60 shadow-sm overflow-hidden">
			<div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
				<div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
					<span className="material-symbols-outlined text-indigo-600 text-[20px]">
						{icon}
					</span>
				</div>
				<div>
					<h3 className="font-headline font-bold text-indigo-900 text-sm leading-none">
						{title}
					</h3>
					<p className="text-slate-500 text-xs mt-1">{description}</p>
				</div>
			</div>
			<div className="px-8 py-6 space-y-5">{children}</div>
		</div>
	);
}
