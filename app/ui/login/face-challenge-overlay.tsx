"use client";

/**
 * Renders the adaptive-liveness challenge prompt + arrow animation shown
 * while we wait for the user to perform the requested head-pose motion.
 * The backend emits look_{left,right,up,down} — user only needs to hold
 * the pose for ~1s while the 5 frames get captured. No blink/nod handling.
 * Purely presentational — the parent (`login-card.tsx`) owns capture timing.
 */

export type ChallengePrompt =
	| "look_left"
	| "look_right"
	| "look_up"
	| "look_down";

const PROMPT_COPY: Record<ChallengePrompt, string> = {
	look_left: "Please turn your head to the left",
	look_right: "Please turn your head to the right",
	look_up: "Please look up",
	look_down: "Please look down",
};

/**
 * Single arrow SVG reused for all four directions:
 *  - outer wrapper applies a static rotation for the direction,
 *  - inner SVG runs the pulse keyframe (translate on its local axis).
 * The base path points LEFT (arrowhead at x=8). Rotations:
 *   look_left  =   0deg
 *   look_right = 180deg
 *   look_up    =  90deg
 *   look_down  = -90deg
 * In the SVG's LOCAL frame the arrowhead always points left, so the pulse
 * along local-X reads correctly as "toward the arrowhead" for every direction.
 */
function LookArrow({ prompt }: { prompt: ChallengePrompt }) {
	const rotationDeg =
		prompt === "look_left"
			? 0
			: prompt === "look_right"
				? 180
				: prompt === "look_up"
					? 90
					: -90;

	return (
		<span
			aria-hidden="true"
			className="inline-flex h-10 w-10 items-center justify-center"
			style={{ transform: `rotate(${rotationDeg}deg)` }}
		>
			<svg
				className="h-10 w-10 text-white"
				fill="none"
				stroke="currentColor"
				strokeWidth={2.5}
				viewBox="0 0 24 24"
				style={{ animation: "fp-arrow-x 1.2s ease-in-out infinite" }}
			>
				<path
					d="M14 6l-6 6 6 6"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}

export default function FaceChallengeOverlay({
	prompt,
}: {
	prompt: ChallengePrompt;
}) {
	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-end gap-3 bg-black/35 p-6 text-white backdrop-blur-[1px]">
			<div className="flex items-center gap-3 rounded-full bg-black/55 px-5 py-3 shadow-lg ring-1 ring-white/15">
				<LookArrow prompt={prompt} />
				<span className="text-sm font-medium leading-snug">
					{PROMPT_COPY[prompt]}
				</span>
			</div>
			<style>{`
				@keyframes fp-arrow-x {
					0%, 100% { transform: translateX(-6px); opacity: 0.7; }
					50%      { transform: translateX(6px);  opacity: 1; }
				}
			`}</style>
		</div>
	);
}
