import type { ReactNode } from "react";
import { getStudentPortalProfile } from "@/app/lib/student-portal";
import SideNav from "@/app/ui/dashboard/sidenav";
import Header from "@/app/ui/dashboard/header";

export default async function StudentLayout({
	children,
}: {
	children: ReactNode;
}) {
	const student = await getStudentPortalProfile();

	return (
		<div className="min-h-screen bg-slate-100">
			<SideNav role="student" />
			<div className="ml-64 min-h-screen flex flex-col">
				<Header
					role="student"
					studentAvatarUrl={student.avatarUrl}
					studentName={student.name}
				/>
				<main className="flex-1 pt-16">{children}</main>
			</div>
		</div>
	);
}
