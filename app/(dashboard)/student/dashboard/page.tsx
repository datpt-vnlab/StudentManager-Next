import ProfileCard, {
	type StudentProfile,
} from "@/app/ui/student-dashboard/profile-card";
import ChangePasswordForm from "@/app/ui/student-dashboard/change-password-form";
import { getStudentPortalProfile } from "@/app/lib/student-portal";

export default async function StudentDashboardPage() {
	const studentData = await getStudentPortalProfile();
	const student: StudentProfile = {
		email: studentData.email,
		id: studentData.id,
		name: studentData.name,
	};

	return (
		<div className="pt-8 pb-12 px-8 max-w-7xl mx-auto">
			<div className="mb-12">
				<h1 className="text-4xl font-headline font-extrabold text-on-background tracking-tight">
					Student Profile
				</h1>
				<p className="text-on-surface-variant font-body mt-2">
					Manage your academic identity and account security.
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
				<div className="lg:col-span-6">
					<ProfileCard student={student} />
				</div>
				<div className="lg:col-span-6">
					<ChangePasswordForm email={student.email} />
				</div>
			</div>
		</div>
	);
}
