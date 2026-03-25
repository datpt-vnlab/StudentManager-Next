import AdminNavLink from "@/app/ui/dashboard/adminnavlink";
import StudentNavLink from "@/app/ui/dashboard/studentnavlink";

type UserRole = "admin" | "student";

type SideNavProps = {
	role: UserRole;
};

export default function SideNav({ role }: SideNavProps) {
	return (
		<aside className="h-screen w-64 fixed left-0 top-0 bg-slate-50 flex flex-col p-4 gap-2 z-40">
			<div className="mb-8 px-2 flex items-center gap-3">
				<div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
					<span className="material-symbols-outlined">school</span>
				</div>
				<div>
					<h2 className="font-headline font-extrabold text-indigo-900 leading-none">
						Editorial Academy
					</h2>
					<p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">
						Management Portal
					</p>
				</div>
			</div>

			{role === "admin" ? <AdminNavLink /> : <StudentNavLink />}
		</aside>
	);
}
