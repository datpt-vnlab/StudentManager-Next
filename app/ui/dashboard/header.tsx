"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import StudentAvatar from "@/app/ui/student-dashboard/student-avatar";

type HeaderProps = {
	role: "admin" | "student";
	studentAvatarUrl?: string;
	studentName?: string;
};

export default function Header({
	role,
	studentAvatarUrl,
	studentName,
}: HeaderProps) {
	const router = useRouter();
	const [errorMessage, setErrorMessage] = useState("");
	const [isPending, startTransition] = useTransition();

	const handleLogout = async () => {
		setErrorMessage("");

		try {
			await fetch("/api/auth/logout", {
				cache: "no-store",
				method: "POST",
			});
		} catch {
			setErrorMessage("Unable to clear the current session cleanly.");
		} finally {
			startTransition(() => {
				router.replace("/login");
				router.refresh();
			});
		}
	};

	return (
		<header className="fixed top-0 left-64 right-0 z-50 bg-white/80 backdrop-blur-xl h-16 border-b border-slate-200/20">
			<div className="flex items-center justify-between px-8 h-full">
				<div className="text-xl font-bold tracking-tight text-indigo-900 font-headline"></div>
				<div className="flex items-center gap-4">
					<button
						onClick={handleLogout}
						disabled={isPending}
						className="p-2 text-slate-500 hover:bg-slate-100/50 rounded-full transition-all active:scale-90"
					>
						<span className="material-symbols-outlined">
							logout
						</span>
					</button>
					{role === "student" && (
						<StudentAvatar
							avatarUrl={studentAvatarUrl}
							name={studentName}
							className="ring-2 ring-primary/10"
							sizeClassName="h-8 w-8 border-2"
							textClassName="text-xs"
						/>
					)}
				</div>
			</div>
			{errorMessage && (
				<p className="absolute right-8 top-full mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
					{errorMessage}
				</p>
			)}
		</header>
	);
}
