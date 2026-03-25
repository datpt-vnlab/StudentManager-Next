import Header from "@/app/ui/home/header";

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="bg-background font-body text-on-background min-h-screen flex flex-col">
			<Header />
			<main className="flex-grow flex items-center justify-center px-4">
				{children}
			</main>
		</div>
	);
}
