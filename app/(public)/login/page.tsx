// Server Component — only the LoginCard inside is "use client"
import Link from "next/link";
import LoginCard from "@/app/ui/login/login-card";

export default function LoginPage() {
	return (
		<div className="bg-background font-body text-on-background min-h-screen flex flex-col">
			<main className="flex-grow flex items-center justify-center px-4 py-24">
				<div className="fixed inset-0 overflow-hidden -z-10 pointer-events-none">
					<div className="absolute -top-[10%] -left-[5%] w-[40%] h-[40%] bg-primary-fixed/20 rounded-full blur-[120px]" />
					<div className="absolute -bottom-[10%] -right-[5%] w-[40%] h-[40%] bg-secondary-fixed/20 rounded-full blur-[120px]" />
				</div>

				<div className="w-full max-w-md">
					<LoginCard />
				</div>
			</main>
		</div>
	);
}
