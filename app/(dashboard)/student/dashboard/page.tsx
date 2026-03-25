// Server Component: fetches the logged-in student's own data, passes to ui components
// When auth is wired up, derive the student ID from the session cookie (see lib/checker.ts)
import ProfileCard, {
	type StudentProfile,
} from "@/app/ui/student-dashboard/profile-card";
import ChangePasswordForm from "@/app/ui/student-dashboard/change-password-form";

// TODO: replace with fetch("http://localhost:3001/students/me", { headers: { cookie } })
const MOCK_STUDENT: StudentProfile = {
	id: "#STU-882910",
	name: "Elena Rodriguez",
	email: "e.rodriguez@academy.edu",
	program: "B.A. Digital Journalism",
	avatarUrl:
		"https://lh3.googleusercontent.com/aida-public/AB6AXuCAPrDF6zI8UsA6wB7MTTFHU03udhWslNqxcO_6jFJwJFM80WudAea7eQtqgni0yRaG_yCerBhdqTKn8YhBX240BUQbfm4MtaOBSmSJ7QDukmrCQmYtjdRi4uXFwpFm4HCr77HOfqKbE5CIzBVsfASolUP4EG6SkWdwS5B6F9f2D7laU2we7kiGCG5uD3rqoDMQeNiizYGGVEFATfzVFLtPRslUcPqKYiEWP0uUC-ujPmKyqWUAVfId_QwkgFuKMRp9UlMR4gRLD9Tm",
};

export default function StudentDashboardPage() {
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
					<ProfileCard student={MOCK_STUDENT} />
				</div>
				<div className="lg:col-span-6">
					<ChangePasswordForm />
				</div>
			</div>
		</div>
	);
}
