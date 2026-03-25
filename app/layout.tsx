import type { Metadata } from "next";
import { manrope, inter } from "@/app/ui/fonts";
import "./ui/globals.css";

// next/font/google: downloads & self-hosts fonts at build time (no external request at runtime)
// `variable` creates a CSS custom property (e.g. --font-manrope) we reference in globals.css

export const metadata: Metadata = {
	title: "Scholar Slate | Editorial Academic Excellence",
	description: "The Editorial Academy portal",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${manrope.variable} ${inter.variable}`}>
			{/* Material Symbols is a variable icon font — not supported by next/font, so we load it here */}
			<head>
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
				/>
			</head>
			<body className="min-h-full flex flex-col">{children}</body>
		</html>
	);
}
