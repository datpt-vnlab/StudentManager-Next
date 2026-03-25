import { redirect } from "next/navigation";

// Admin overview — redirects to Student Registry (the main admin view)
export default function AdminDashboardPage() {
	redirect("/admin/dashboard/student");
}
