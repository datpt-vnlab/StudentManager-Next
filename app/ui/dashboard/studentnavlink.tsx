"use client";

import Link from "next/link";
import { MdPerson, MdSettings } from "react-icons/md";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
	{ name: "My Profile", href: "/student/dashboard", icon: MdPerson },
	{ name: "Settings", href: "/student/settings", icon: MdSettings },
];

export default function StudentNavLink() {
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
							"flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-label text-sm font-semibold",
							pathname === link.href
								? "bg-white text-indigo-700 shadow-sm translate-x-1"
								: "text-slate-600 hover:bg-slate-200/50 hover:translate-x-1",
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
