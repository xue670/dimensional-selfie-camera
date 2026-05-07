import type { CharacterTransform } from "../../types";

type CaptureSceneOptions = {
  video: HTMLVideoElement;
  overlayCanvas: HTMLCanvasElement | null;
  imageElement: HTMLImageElement | null;
  transform: CharacterTransform;
  viewport: { width: number; height: number };
};

export function captureScene({
  video,
  overlayCanvas,
  imageElement,
  transform,
  viewport,
}: CaptureSceneOptions): string {
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("截图上下文不可用。");
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (imageElement) {
    context.save();
    context.translate(transform.x, transform.y);
    context.rotate((transform.rotation * Math.PI) / 180);
    context.scale(transform.scale, transform.scale);

    const width = imageElement.naturalWidth;
    const height = imageElement.naturalHeight;
    const ratio = Math.min(1, 320 / Math.max(width, height));
    const drawWidth = width * ratio;
    const drawHeight = height * ratio;

    context.drawImage(
      imageElement,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();
  }

  if (overlayCanvas) {
    context.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
  }

  return canvas.toDataURL("image/png");
}
