// Server Component — receives student data as props, purely presentational

export type StudentProfile = {
	id: string;
	name: string;
	email: string;
	program?: string;
	avatarUrl?: string;
};

export default function ProfileCard({ student }: { student: StudentProfile }) {
	const displayName = student.name?.trim() || "Student";
	const initials = displayName
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");

	return (
		<section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm overflow-hidden relative group">
			{/* Decorative background circle */}
			<div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-500" />

			<div className="relative flex flex-col items-center text-center">
				{/* Avatar */}
				<div className="relative mb-6">
					<div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-xl">
						{student.avatarUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={student.avatarUrl}
								alt={`Portrait of ${displayName}`}
								className="w-full h-full object-cover"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center bg-primary text-3xl font-bold text-white">
								{initials || "ST"}
							</div>
						)}
					</div>
				</div>

				<h3 className="font-headline text-2xl font-bold text-on-surface">
					{displayName}
				</h3>
				<p className="text-on-surface-variant text-sm tracking-wide uppercase font-semibold mt-1">
					ID: {student.id}
				</p>

				{/* Info rows */}
				<div className="mt-8 w-full space-y-4">
					<div className="flex items-center justify-between p-4 bg-surface-container-low rounded-lg">
						<span className="text-on-surface-variant text-xs font-bold uppercase tracking-widest">
							Email Address
						</span>
						<span className="text-on-surface font-bold text-sm">
							{student.email}
						</span>
					</div>
					{student.program && (
						<div className="flex items-center justify-between p-4 bg-surface-container-low rounded-lg">
							<span className="text-on-surface-variant text-xs font-bold uppercase tracking-widest">
								Enrolled Program
							</span>
							<span className="text-primary font-bold text-sm">
								{student.program}
							</span>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
