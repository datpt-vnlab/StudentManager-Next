import { getAdminMajors, getAdminStudents } from "@/app/lib/admin-students";
import StudentTable from "@/app/ui/student/table";

export default async function StudentRegistryPage() {
	const majors = await getAdminMajors();
	const students = await getAdminStudents();

	return (
		<section className="p-8 flex-1 bg-surface">
			<div className="mb-8">
				<h1 className="font-headline text-3xl font-extrabold text-indigo-900 tracking-tight">
					Student Registry
				</h1>
				<p className="text-slate-500 mt-2 font-medium">
					Simplified institutional records management.
				</p>
			</div>

			<StudentTable majors={majors} students={students} />
		</section>
	);
}
