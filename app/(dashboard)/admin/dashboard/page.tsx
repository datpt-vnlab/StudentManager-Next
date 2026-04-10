import { requireRole } from "@/app/lib/auth";
import { redirect } from "next/navigation";

// Admin overview — redirects to Student Registry (the main admin view)
export default async function AdminDashboardPage() {
	await requireRole("admin");

	redirect("/admin/dashboard/student");
}
