import ChangePasswordForm from "@/app/ui/student-dashboard/change-password-form";
import { getStudentPortalProfile } from "@/app/lib/student-portal";

export default async function StudentSettingsPage() {
	const student = await getStudentPortalProfile();

	return (
		<div className="mx-auto max-w-4xl px-8 pt-8 pb-12">
			<div className="mb-12">
				<h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-background">
					Settings
				</h1>
				<p className="mt-2 font-body text-on-surface-variant">
					Update your password and review account security.
				</p>
			</div>

			<ChangePasswordForm email={student.email} />
		</div>
	);
}
