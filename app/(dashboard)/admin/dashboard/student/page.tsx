// Server Component: fetches student data, passes to ui/student/table
// TODO: replace with fetch("http://localhost:3001/students", { cache: "no-store" })
import StudentTable, { type Student } from "@/app/ui/student/table";

const MOCK_STUDENTS: Student[] = [
	{
		id: "STU20260001",
		first_name: "Elena",
		last_name: "Rodriguez",
		email: "elena.r@editorial.edu",
		status: "Active",
	},
	{
		id: "STU20260042",
		first_name: "Julian",
		last_name: "Montgomery",
		email: "j.mont@editorial.edu",
		status: "Suspended",
	},
	{
		id: "STU20260098",
		first_name: "Sarah",
		last_name: "Tanaka",
		email: "stanaka@editorial.edu",
		status: "Graduated",
	},
];

export default function StudentRegistryPage() {
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

			<StudentTable students={MOCK_STUDENTS} />
		</section>
	);
}
