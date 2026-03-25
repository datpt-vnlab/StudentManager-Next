// Server Component — pure presentational, no interactivity needed
// next/link is fine in Server Components; only hooks (useRouter, useState) require "use client"
import Link from "next/link";
import Image from "next/image";

export default function Hero() {
	return (
		<section className="relative min-h-[calc(100vh-64px)] flex items-center overflow-hidden px-8 md:px-12 lg:px-24">
			{/* Background decorations */}
			<div className="absolute inset-0 z-0">
				<div className="absolute top-0 right-0 w-1/2 h-full bg-surface-container-low skew-x-[-12deg] translate-x-24" />
				<div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
			</div>

			<div className="relative z-10 grid w-full max-w-6xl mx-auto md:grid-cols-2 gap-16 items-center">
				{/* Text content */}
				<div className="space-y-8">
					<div className="space-y-4">
						<span className="inline-block px-4 py-1.5 bg-secondary-container text-on-secondary-container rounded-full text-[0.6875rem] font-semibold tracking-[0.05rem] uppercase font-label">
							Secure Entry Portal
						</span>
						<h1 className="text-5xl md:text-7xl font-extrabold text-on-background leading-[1.1] font-headline">
							Curating{" "}
							<span className="text-primary">Academic</span>{" "}
							Excellence.
						</h1>
						<p className="text-lg text-on-surface-variant max-w-md leading-relaxed font-body">
							The Editorial Academy portal transforms
							institutional data into a sophisticated,
							high-performance narrative for students and faculty.
						</p>
					</div>

					{/* Login button — Link navigates to /login route */}
					<div className="flex flex-wrap items-center gap-6">
						<Link
							href="/login"
							className="signature-gradient text-on-primary px-10 py-4 rounded-xl font-semibold shadow-sm hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
						>
							<span>Login to Portal</span>
							<span className="material-symbols-outlined text-sm">
								login
							</span>
						</Link>
					</div>

					{/* Stats */}
					<div className="flex items-center gap-8 pt-4">
						<div className="flex flex-col">
							<span className="text-2xl font-bold font-headline text-on-background">
								12k+
							</span>
							<span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
								Active Students
							</span>
						</div>
						<div className="w-px h-8 bg-outline-variant/30" />
						<div className="flex flex-col">
							<span className="text-2xl font-bold font-headline text-on-background">
								98%
							</span>
							<span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
								Success Rate
							</span>
						</div>
					</div>
				</div>

				{/* Hero image — next/image requires width+height for remote images */}
				<div className="hidden md:block relative h-[500px] w-full">
					<div className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl">
						<Image
							src="/hero_image.png"
							alt="University library"
							fill
							sizes="(min-width: 768px) 50vw"
							className="object-cover"
							// loading="eager"
							priority
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
					</div>
					<div className="absolute -bottom-6 -right-6 w-48 h-48 bg-primary/10 rounded-full blur-2xl" />
				</div>
			</div>
		</section>
	);
}
