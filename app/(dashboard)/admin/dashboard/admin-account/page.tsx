// Server Component: fetches admin data, passes to ui/admin/table
// TODO: replace with fetch("http://localhost:3001/admins", { cache: "no-store" })
import AdminTable, { type Admin } from "@/app/ui/admin/table";

const MOCK_ADMINS: Admin[] = [
	{
		id: "#AD-001",
		name: "Dr. Victoria Hartwell",
		email: "v.hartwell@editorial.edu",
	},
	{
		id: "#AD-002",
		name: "Marcus Chen",
		email: "m.chen@editorial.edu",
	},
	{
		id: "#AD-003",
		name: "Priya Nair",
		email: "p.nair@editorial.edu",
	},
];

export default function AdminAccountsPage() {
	return (
		<section className="p-8 flex-1 bg-surface">
			<div className="mb-8">
				<h1 className="font-headline text-3xl font-extrabold text-indigo-900 tracking-tight">
					Admin Accounts
				</h1>
				<p className="text-slate-500 mt-2 font-medium">
					Manage administrator accounts and access.
				</p>
			</div>

			<AdminTable admins={MOCK_ADMINS} />
		</section>
	);
}
