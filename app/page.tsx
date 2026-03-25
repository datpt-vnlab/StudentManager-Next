// Server Component: assembles the home page from ui/home/ pieces
// Each import is also a Server Component — no JS bundle sent for pure markup
import Header from "@/app/ui/home/header";
import Hero from "@/app/ui/home/hero";
import Footer from "@/app/ui/home/footer";

export default function Home() {
	return (
		<>
			<Header />
			<main className="pt-16">
				<Hero />
			</main>
			<Footer />
		</>
	);
}
