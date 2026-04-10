"use client";

import StudentAvatar from "@/app/ui/student-dashboard/student-avatar";

export type StudentProfile = {
	address?: string;
	avatarUrl?: string;
	birthday?: string;
	id: string;
	email: string;
	gender?: string;
	major?: string;
	name: string;
};

function InfoRow({
	children,
	label,
}: {
	children: React.ReactNode;
	label: string;
}) {
	return (
		<div className="rounded-lg bg-surface-container-low p-4 text-left">
			<p className="mb-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
				{label}
			</p>
			{children}
		</div>
	);
}

export default function ProfileCard({ student }: { student: StudentProfile }) {
	const displayName = student.name?.trim() || "Student";
	const formattedBirthday = student.birthday
		? new Date(student.birthday).toLocaleDateString("en-GB")
		: "01/01/2000";
	const displayGender = student.gender?.trim() || "Male";
	const displayMajor = student.major?.trim() || "Unknown";

	return (
		<section className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-sm">
			<div className="absolute top-0 right-0 -mt-16 -mr-16 h-32 w-32 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-110" />

			<div className="relative flex flex-col items-center text-center">
				<div className="relative mb-6">
					<StudentAvatar
						avatarUrl={student.avatarUrl}
						name={displayName}
						sizeClassName="h-32 w-32 border-4"
						textClassName="text-3xl"
					/>
				</div>

				<h3 className="font-headline text-2xl font-bold text-on-surface">
					{displayName}
				</h3>
				<p className="mt-1 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
					ID: {student.id}
				</p>

				<div className="mt-8 w-full space-y-4 text-left">
					<InfoRow label="Major">
						<p className="text-sm font-bold text-primary">
							{displayMajor}
						</p>
					</InfoRow>

					<InfoRow label="Gender">
						<p className="text-sm font-bold text-on-surface">
							{displayGender}
						</p>
					</InfoRow>

					<InfoRow label="Birthday">
						<p className="text-sm font-bold text-on-surface">
							{formattedBirthday}
						</p>
					</InfoRow>
				</div>
			</div>
		</section>
	);
}
