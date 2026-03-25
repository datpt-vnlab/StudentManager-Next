"use client";

export default function Toggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${checked ? "bg-primary" : "bg-slate-200"}`}
		>
			<span
				className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`}
			/>
		</button>
	);
}
