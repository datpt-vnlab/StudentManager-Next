type StudentAvatarProps = {
	avatarUrl?: string;
	className?: string;
	name?: string;
	sizeClassName?: string;
	textClassName?: string;
};

export function getStudentInitials(name?: string | null) {
	const parts =
		name
			?.trim()
			.split(/\s+/)
			.filter(Boolean) ?? [];

	if (parts.length === 0) {
		return "ST";
	}

	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase() || "ST";
	}

	const first = parts[0]?.[0] ?? "";
	const last = parts[parts.length - 1]?.[0] ?? "";

	return `${first}${last}`.toUpperCase() || "ST";
}

export default function StudentAvatar({
	avatarUrl,
	className = "",
	name,
	sizeClassName = "h-32 w-32 border-4",
	textClassName = "text-3xl",
}: StudentAvatarProps) {
	const displayName = name?.trim() || "Student";
	const initials = getStudentInitials(displayName);

	return (
		<div
			className={`select-none overflow-hidden rounded-full border-white shadow-xl ${sizeClassName} ${className}`.trim()}
		>
			{avatarUrl ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={avatarUrl}
					alt={`Portrait of ${displayName}`}
					draggable={false}
					className="pointer-events-none h-full w-full object-cover"
				/>
			) : (
				<div
					className={`flex h-full w-full items-center justify-center bg-primary font-bold text-white ${textClassName}`.trim()}
				>
					{initials}
				</div>
			)}
		</div>
	);
}
