// Server Component — receives student data as props, purely presentational

export type StudentProfile = {
	id: string;
	name: string;
	email: string;
	program: string;
	avatarUrl: string;
};

export default function ProfileCard({ student }: { student: StudentProfile }) {
	return (
		<section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm overflow-hidden relative group">
			{/* Decorative background circle */}
			<div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-500" />

			<div className="relative flex flex-col items-center text-center">
				{/* Avatar */}
				<div className="relative mb-6">
					<div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-xl">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={student.avatarUrl}
							alt={`Portrait of ${student.name}`}
							className="w-full h-full object-cover"
						/>
					</div>
					<button className="absolute bottom-1 right-1 bg-white p-2 rounded-full shadow-md text-primary hover:text-primary-container transition-colors">
						<span
							className="material-symbols-outlined text-sm"
							style={{ fontVariationSettings: "'FILL' 1" }}
						>
							edit
						</span>
					</button>
				</div>

				<h3 className="font-headline text-2xl font-bold text-on-surface">
					{student.name}
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
					<div className="flex items-center justify-between p-4 bg-surface-container-low rounded-lg">
						<span className="text-on-surface-variant text-xs font-bold uppercase tracking-widest">
							Enrolled Program
						</span>
						<span className="text-primary font-bold text-sm">
							{student.program}
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}
