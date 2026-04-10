"use client";

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

export function dataUrlToFile(dataUrl: string, filename: string) {
	const [header, content] = dataUrl.split(",");

	if (!header || !content) {
		return null;
	}

	const mimeMatch = header.match(/data:(.*?);base64/);
	const mimeType = mimeMatch?.[1] || "image/jpeg";
	const binary = atob(content);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

	return new File([bytes], filename, { type: mimeType });
}

export function captureVisibleVideoFrame(
	video: HTMLVideoElement,
	canvas: HTMLCanvasElement,
) {
	const videoWidth = video.videoWidth || 1280;
	const videoHeight = video.videoHeight || 720;
	const displayedWidth = video.clientWidth || videoWidth;
	const displayedHeight = video.clientHeight || videoHeight;

	const scale = Math.max(
		displayedWidth / videoWidth,
		displayedHeight / videoHeight,
	);
	const renderedWidth = videoWidth * scale;
	const renderedHeight = videoHeight * scale;
	const cropOffsetX = (renderedWidth - displayedWidth) / 2;
	const cropOffsetY = (renderedHeight - displayedHeight) / 2;
	const sourceX = clamp(cropOffsetX / scale, 0, videoWidth);
	const sourceY = clamp(cropOffsetY / scale, 0, videoHeight);
	const sourceWidth = clamp(displayedWidth / scale, 1, videoWidth - sourceX);
	const sourceHeight = clamp(displayedHeight / scale, 1, videoHeight - sourceY);

	canvas.width = Math.round(sourceWidth);
	canvas.height = Math.round(sourceHeight);

	const context = canvas.getContext("2d");

	if (!context) {
		throw new Error("Unable to capture the current frame.");
	}

	context.drawImage(
		video,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		canvas.width,
		canvas.height,
	);

	return canvas.toDataURL("image/jpeg", 0.92);
}
