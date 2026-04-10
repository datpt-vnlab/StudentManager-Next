"use client";

export default function Toggle({
	checked,
	disabled = false,
	onChange,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-primary" : "bg-slate-200"}`}
		>
			<span
				className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`}
			/>
		</button>
	);
}
