import type { CharacterTransform } from "../../types";
import { getAssetDisplaySize } from "../assets/displaySize";

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

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.restore();

  if (imageElement) {
    const displaySize = getAssetDisplaySize(
      imageElement.naturalWidth,
      imageElement.naturalHeight,
    );

    context.save();
    context.translate(transform.x, transform.y);
    context.rotate((transform.rotation * Math.PI) / 180);
    context.scale(transform.scale, transform.scale);

    context.drawImage(
      imageElement,
      -displaySize.width / 2,
      -displaySize.height / 2,
      displaySize.width,
      displaySize.height,
    );
    context.restore();
  }

  if (overlayCanvas) {
    context.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
  }

  return canvas.toDataURL("image/png");
}
