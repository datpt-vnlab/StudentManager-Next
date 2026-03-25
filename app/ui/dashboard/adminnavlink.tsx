"use client";

import Link from "next/link";
import { MdPeopleAlt, MdSettings } from "react-icons/md";
import { FaShieldAlt } from "react-icons/fa";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
	{
		href: "/admin/dashboard/student",
		icon: MdPeopleAlt,
		name: "Student Registry",
	},
	{
		href: "/admin/dashboard/admin-account",
		icon: FaShieldAlt,
		name: "Admin Accounts",
	},
	{
		href: "/admin/dashboard/settings",
		icon: MdSettings,
		name: "Settings",
	},
];

export default function AdminNavLink() {
	const pathname = usePathname();

	return (
		<nav className="flex-1 space-y-1">
			{links.map((link) => {
				const Icon = link.icon;
				return (
					<Link
						key={link.href}
						href={link.href}
						className={clsx(
							"flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:translate-x-1 font-label text-sm font-semibold",
							pathname === link.href
								? "bg-white text-indigo-700 shadow-sm"
								: "text-slate-600 hover:bg-slate-200/50",
						)}
					>
						<Icon className="text-lg shrink-0" />
						<span>{link.name}</span>
					</Link>
				);
			})}
		</nav>
	);
}
