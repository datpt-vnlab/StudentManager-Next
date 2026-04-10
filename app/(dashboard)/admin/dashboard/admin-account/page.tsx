import { getAdminAccounts } from "@/app/lib/admin-management";
import AdminTable from "@/app/ui/admin/table";

export default async function AdminAccountsPage() {
	const admins = await getAdminAccounts();

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

			<AdminTable admins={admins} />
		</section>
	);
}
