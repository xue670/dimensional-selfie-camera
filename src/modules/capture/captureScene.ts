import type { CharacterTransform } from "../../types";
import { getAssetDisplaySize } from "../assets/displaySize";

type CaptureSceneOptions = {
  video: HTMLVideoElement;
  overlayCanvas: HTMLCanvasElement | null;
  imageElement: HTMLImageElement | null;
  transform: CharacterTransform;
  viewport: { width: number; height: number };
};

function getCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const cropWidth = sourceHeight * targetAspect;
    return {
      sx: (sourceWidth - cropWidth) / 2,
      sy: 0,
      sw: cropWidth,
      sh: sourceHeight,
    };
  }

  const cropHeight = sourceWidth / targetAspect;
  return {
    sx: 0,
    sy: (sourceHeight - cropHeight) / 2,
    sw: sourceWidth,
    sh: cropHeight,
  };
}

export function captureScene({
  video,
  overlayCanvas,
  imageElement,
  transform,
  viewport,
}: CaptureSceneOptions): string {
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.round(viewport.height * outputScale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("截图上下文不可用。");
  }

  context.scale(outputScale, outputScale);

  const sourceWidth = video.videoWidth || viewport.width;
  const sourceHeight = video.videoHeight || viewport.height;
  const sourceRect = getCoverSourceRect(
    sourceWidth,
    sourceHeight,
    viewport.width,
    viewport.height,
  );

  context.save();
  context.translate(viewport.width, 0);
  context.scale(-1, 1);
  context.drawImage(
    video,
    sourceRect.sx,
    sourceRect.sy,
    sourceRect.sw,
    sourceRect.sh,
    0,
    0,
    viewport.width,
    viewport.height,
  );
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
    context.drawImage(overlayCanvas, 0, 0, viewport.width, viewport.height);
  }

  return canvas.toDataURL("image/png");
}
