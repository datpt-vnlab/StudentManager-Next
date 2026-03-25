"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

type Tab = "student" | "admin";
type ScanState = "idle" | "scanning" | "success";

// ── Face Scan Overlay ────────────────────────────────────────────────────────

function FaceScanOverlay({
	onCancel,
	onSuccess,
}: {
	onCancel: () => void;
	onSuccess: () => void;
}) {
	const [state, setState] = useState<ScanState>("scanning");

	useEffect(() => {
		// Mock: 2-second "scan" then success
		const t1 = setTimeout(() => setState("success"), 2000);
		const t2 = setTimeout(() => onSuccess(), 2800);
		return () => { clearTimeout(t1); clearTimeout(t2); };
	}, [onSuccess]);

	return (
		<div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/97 p-8">
			{/* Close */}
			{state !== "success" && (
				<button
					onClick={onCancel}
					className="absolute top-6 right-6 p-2 text-white/40 hover:text-white/80 transition-colors"
				>
					<span className="material-symbols-outlined text-2xl">close</span>
				</button>
			)}

			<div className="flex flex-col items-center gap-8">
				{/* Viewfinder */}
				<div className="relative w-60 h-60 flex items-center justify-center">
					{/* Pulsing outer ring */}
					{state === "scanning" && (
						<div className="absolute inset-0 rounded-full border border-indigo-500/30 animate-ping" />
					)}

					{/* Main ring */}
					<div
						className={`absolute inset-0 rounded-full border-2 transition-colors duration-500 ${state === "success" ? "border-emerald-400" : "border-indigo-400/80"}`}
					/>

					{/* Corner brackets */}
					{(["tl", "tr", "bl", "br"] as const).map((pos) => (
						<div
							key={pos}
							className={`absolute w-7 h-7 transition-colors duration-500 ${state === "success" ? "border-emerald-400" : "border-indigo-400"} ${pos === "tl" ? "top-3 left-3 border-t-2 border-l-2 rounded-tl-lg" : pos === "tr" ? "top-3 right-3 border-t-2 border-r-2 rounded-tr-lg" : pos === "bl" ? "bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg" : "bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg"}`}
						/>
					))}

					{/* Face icon / check */}
					{state === "success" ? (
						<span className="material-symbols-outlined text-[72px] text-emerald-400">
							check_circle
						</span>
					) : (
						<span className="material-symbols-outlined text-[72px] text-white/15">
							face
						</span>
					)}

					{/* Scan line */}
					{state === "scanning" && (
						<>
							<div
								className="absolute left-8 right-8 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
								style={{ animation: "faceScanLine 2s ease-in-out infinite" }}
							/>
							<style>{`
								@keyframes faceScanLine {
									0%   { top: 20%; opacity: 0.3; }
									50%  { top: 80%; opacity: 1;   }
									100% { top: 20%; opacity: 0.3; }
								}
							`}</style>
						</>
					)}
				</div>

				{/* Status text */}
				<div className="text-center">
					<p
						className={`font-semibold text-lg transition-colors duration-300 ${state === "success" ? "text-emerald-400" : "text-white"}`}
					>
						{state === "success" ? "Face Recognized" : "Face ID Login"}
					</p>
					<p className="text-white/50 text-sm mt-1">
						{state === "success"
							? "Signing you in…"
							: "Position your face within the frame"}
					</p>
				</div>

				{/* Dots indicator */}
				{state === "scanning" && (
					<div className="flex gap-2">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className="w-1.5 h-1.5 rounded-full bg-indigo-400"
								style={{
									animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
								}}
							/>
						))}
						<style>{`
							@keyframes dotPulse {
								0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
								40%           { opacity: 1;   transform: scale(1.2); }
							}
						`}</style>
					</div>
				)}
			</div>
		</div>
	);
}

// ── Login Card ───────────────────────────────────────────────────────────────

export default function LoginCard() {
	const [tab, setTab] = useState<Tab>("student");
	const [showPassword, setShowPassword] = useState(false);
	const [studentId, setStudentId] = useState("");
	const [studentPassword, setStudentPassword] = useState("");
	const [adminId, setAdminId] = useState("");
	const [adminOTP, setAdminOTP] = useState("");
	const [showFaceScan, setShowFaceScan] = useState(false);

	const router = useRouter();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (tab === "student") {
			if (studentId && studentPassword && handleStudentLogin(studentId, studentPassword)) {
				router.push("/student/dashboard");
			}
		} else {
			if (adminId && adminOTP && handleAdminLogin(adminId, adminOTP)) {
				router.push("/admin/dashboard");
			}
		}
	};

	// Temporary — will be replaced with API calls
	const handleStudentLogin = (id: string, password: string) =>
		id === "student" && password === "student";
	const handleAdminLogin = (id: string, otp: string) =>
		id === "admin" && otp === "123456";

	const handleFaceScanSuccess = () => {
		setShowFaceScan(false);
		router.push("/admin/dashboard");
	};

	return (
		<>
			{showFaceScan && (
				<FaceScanOverlay
					onCancel={() => setShowFaceScan(false)}
					onSuccess={handleFaceScanSuccess}
				/>
			)}

			<div className="glass-panel rounded-xl shadow-sm overflow-hidden p-8 md:p-10">
				{/* Card header */}
				<div className="mb-8 text-center">
					<h1 className="font-headline text-2xl font-extrabold text-on-surface mb-2">
						Welcome Back
					</h1>
					<p className="text-on-surface-variant text-sm">
						Access your academic and administrative portal.
					</p>
				</div>

				{/* Role switcher */}
				<div className="bg-surface-container-low p-1 rounded-lg flex mb-8">
					<button
						type="button"
						onClick={() => setTab("student")}
						className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${tab === "student" ? "bg-white shadow-sm text-primary" : "text-on-surface-variant hover:bg-surface-container-high"}`}
					>
						Student
					</button>
					<button
						type="button"
						onClick={() => setTab("admin")}
						className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${tab === "admin" ? "bg-white shadow-sm text-primary" : "text-on-surface-variant hover:bg-surface-container-high"}`}
					>
						Admin
					</button>
				</div>

				<form className="space-y-6" onSubmit={handleSubmit}>
					{tab === "student" ? (
						<div className="space-y-5">
							<div className="space-y-2">
								<label className="block font-label text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider ml-1">
									Student ID
								</label>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										badge
									</span>
									<input
										type="text"
										placeholder="e.g. STU20260001"
										onChange={(e) => setStudentId(e.target.value)}
										className="w-full pl-12 pr-4 py-3 bg-surface-container-highest border-none rounded-lg focus:ring-2 focus:ring-primary/40 focus:bg-white transition-all text-sm outline-none"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<label className="block font-label text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider ml-1">
									Password
								</label>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										lock
									</span>
									<input
										type={showPassword ? "text" : "password"}
										placeholder="••••••••"
										autoComplete="current-password"
										name="password"
										onChange={(e) => setStudentPassword(e.target.value)}
										className="w-full pl-12 pr-12 py-3 bg-surface-container-highest border-none rounded-lg focus:ring-2 focus:ring-primary/40 focus:bg-white transition-all text-sm outline-none"
									/>
									<button
										type="button"
										onClick={() => setShowPassword((v) => !v)}
										className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
									>
										<span className="material-symbols-outlined text-lg">
											{showPassword ? "visibility_off" : "visibility"}
										</span>
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="space-y-5">
							<div className="space-y-2">
								<label className="block font-label text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider ml-1">
									Email
								</label>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										mail
									</span>
									<input
										type="email"
										placeholder="admin@scholar-slate.edu"
										onChange={(e) => setAdminId(e.target.value)}
										className="w-full pl-12 pr-4 py-3 bg-surface-container-highest border-none rounded-lg focus:ring-2 focus:ring-primary/40 focus:bg-white transition-all text-sm outline-none"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<div className="flex justify-between items-center px-1">
									<label className="block font-label text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
										OTP (One-Time Password)
									</label>
									<button
										type="button"
										className="text-[10px] font-bold text-primary hover:underline"
									>
										Resend
									</button>
								</div>
								<div className="relative">
									<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
										key
									</span>
									<input
										type="text"
										maxLength={6}
										placeholder="000000"
										onChange={(e) => setAdminOTP(e.target.value)}
										className="w-full pl-12 pr-4 py-3 bg-surface-container-highest border-none rounded-lg focus:ring-2 focus:ring-primary/40 focus:bg-white transition-all text-sm outline-none tracking-[0.5em] font-mono"
									/>
								</div>
							</div>
						</div>
					)}

					{/* Shared footer */}
					<div className="flex items-center justify-between px-1">
						<label className="flex items-center gap-2 cursor-pointer group">
							<input
								type="checkbox"
								className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant/50 bg-surface-container-highest"
							/>
							<span className="text-xs text-on-surface-variant group-hover:text-on-surface transition-colors">
								Remember me
							</span>
						</label>
						{tab === "student" && (
							<a
								href="#"
								className="text-xs font-semibold text-primary hover:underline"
							>
								Forgot password?
							</a>
						)}
					</div>

					<button
						type="submit"
						className="w-full signature-gradient text-white font-semibold py-3.5 rounded-lg shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200 text-sm"
					>
						Sign In to Dashboard
					</button>

					{/* Face ID — admin only */}
					{tab === "admin" && (
						<>
							<div className="relative flex items-center gap-3">
								<div className="flex-1 h-px bg-slate-200" />
								<span className="text-xs text-slate-400 font-medium">or</span>
								<div className="flex-1 h-px bg-slate-200" />
							</div>
							<button
								type="button"
								onClick={() => setShowFaceScan(true)}
								className="w-full flex items-center justify-center gap-2.5 py-3 rounded-lg border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-indigo-300 transition-all"
							>
								<span className="material-symbols-outlined text-[20px] text-indigo-500">
									face_retouching_natural
								</span>
								Sign in with Face ID
							</button>
						</>
					)}
				</form>
			</div>
		</>
	);
}
