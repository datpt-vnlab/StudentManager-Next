// Server Component (default) — no "use client" needed since there's no state or browser APIs
import { MdSchool } from "react-icons/md";
import { SlLogin } from "react-icons/sl";
import Link from "next/link";

export default function Header() {
	return (
		<nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl bg-slate-50/50">
			<div className="flex items-center justify-between px-8 h-16 w-full max-w-screen-2xl mx-auto">
				{/* Brand */}
				<Link
					href="/"
					className="flex items-center gap-2 cursor-pointer"
				>
					<MdSchool className="text-primary text-2xl" />
					<span className="text-xl font-bold tracking-tight text-indigo-900 font-headline select-none">
						Academia Curator
					</span>
				</Link>

				{/* Actions */}
				<div className="flex items-center gap-4">
					<Link
						href="/login"
						className="p-2 hover:bg-slate-100/50 rounded-full transition-colors cursor-pointer scale-95 active:scale-90 inline-flex items-center justify-center"
					>
						<SlLogin className="text-slate-600 w-6 h-6" />
					</Link>
				</div>
			</div>
		</nav>
	);
}
