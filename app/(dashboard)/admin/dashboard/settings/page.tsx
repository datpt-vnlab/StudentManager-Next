import { requireRole } from "@/app/lib/auth";
import SettingsPanel from "@/app/ui/settings/panel";

export default async function SettingsPage() {
	await requireRole("admin");

	return (
		<section className="p-8 flex-1 bg-surface">
			<div className="mb-8">
				<h1 className="font-headline text-3xl font-extrabold text-indigo-900 tracking-tight">
					Settings
				</h1>
			</div>

			<SettingsPanel />
		</section>
	);
}
