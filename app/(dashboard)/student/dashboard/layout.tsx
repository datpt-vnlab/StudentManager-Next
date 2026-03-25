import type { ReactNode } from "react";
import SideNav from "@/app/ui/dashboard/sidenav";
import Header from "@/app/ui/dashboard/header";

export default function StudentLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-slate-100">
			<SideNav role="student" />
			<div className="ml-64 min-h-screen flex flex-col">
				<Header />
				<main className="flex-1 pt-16">{children}</main>
			</div>
		</div>
	);
}
