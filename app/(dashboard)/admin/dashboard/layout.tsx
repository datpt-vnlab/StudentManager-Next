import type { ReactNode } from "react";
import SideNav from "@/app/ui/dashboard/sidenav";
import Header from "@/app/ui/dashboard/header";

export default function AdminLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-slate-100">
			<SideNav role="admin" />
			{/*<div className="ml-64 min-h-screen">{children}</div>*/}
			<div className="ml-64 min-h-screen flex flex-col">
				<Header />
				<div className="flex-1 pt-16">{children}</div>
			</div>
		</div>
	);
}
