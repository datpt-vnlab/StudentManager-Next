"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function Header({ children }: { children: ReactNode }) {
	const router = useRouter();

	return (
		<header className="fixed top-0 left-64 right-0 z-50 bg-white/80 backdrop-blur-xl h-16 border-b border-slate-200/20">
			<div className="flex items-center justify-between px-8 h-full">
				<div className="text-xl font-bold tracking-tight text-indigo-900 font-headline"></div>
				<div className="flex items-center gap-4">
					<button
						onClick={() => router.push("/login")}
						className="p-2 text-slate-500 hover:bg-slate-100/50 rounded-full transition-all active:scale-90"
					>
						<span className="material-symbols-outlined">
							logout
						</span>
					</button>
					<div className="h-8 w-8 rounded-full bg-slate-200 overflow-hidden ring-2 ring-primary/10">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="https://lh3.googleusercontent.com/aida-public/AB6AXuDW0EDARyj7HY9PtNQRGoX-qeB05KjrPg62A3BTFz2nyl0dY4iG10-Qh74TFuVLS1dk8_UYzA9DyE9A1C2g_vtHnD5zhUYC5UsqRH12ulP1CJaqVUeohQFNxkMUnM225EHJhPy2uSm_A-yLV8xGlEav8QPc75enpRM-E5HpsSbiEM_fznuByY5ceHBxD6m9KMWERZQgPRTsB4sMVZ_KcBjKMO59xFB529Ui5XPznCEjQagwyH9V8WI5UXJRMtCM7g-3bYKUBYgpOIYS"
							alt="User avatar"
							className="w-full h-full object-cover"
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
