import { useEffect, useRef } from "react";

type UseWaveTriggerOptions = {
  active: boolean;
  video: HTMLVideoElement | null;
  onTrigger: () => void;
};

const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 72;
const SAMPLE_INTERVAL_MS = 120;
const PIXEL_DELTA_THRESHOLD = 36;
const REGION_MOTION_RATIO_THRESHOLD = 0.12;
const PULSE_GAP_MS = 900;
const TRIGGER_COOLDOWN_MS = 2400;
const LEFT_REGION_X_END = 0.28;
const RIGHT_REGION_X_START = 0.72;
const REGION_Y_START = 0.16;
const REGION_Y_END = 0.68;

type MotionPulse = {
  at: number;
  side: "left" | "right";
};

export function useWaveTrigger({
  active,
  video,
  onTrigger,
}: UseWaveTriggerOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef(0);
  const recentPulseRef = useRef<MotionPulse | null>(null);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (!active || !video) {
      previousFrameRef.current = null;
      recentPulseRef.current = null;
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = SAMPLE_WIDTH;
      canvasRef.current.height = SAMPLE_HEIGHT;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    const leftStartX = 0;
    const leftEndX = Math.floor(SAMPLE_WIDTH * LEFT_REGION_X_END);
    const rightStartX = Math.floor(SAMPLE_WIDTH * RIGHT_REGION_X_START);
    const rightEndX = SAMPLE_WIDTH;
    const startY = Math.floor(SAMPLE_HEIGHT * REGION_Y_START);
    const endY = Math.floor(SAMPLE_HEIGHT * REGION_Y_END);

    const detectRegionMotionRatio = (
      current: Uint8ClampedArray,
      previous: Uint8ClampedArray,
      startX: number,
      endX: number,
    ) => {
      let activePixels = 0;
      let comparedPixels = 0;

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * SAMPLE_WIDTH + x) * 4;
          const currentGray =
            current[index] * 0.299 +
            current[index + 1] * 0.587 +
            current[index + 2] * 0.114;
          const previousGray =
            previous[index] * 0.299 +
            previous[index + 1] * 0.587 +
            previous[index + 2] * 0.114;

          if (Math.abs(currentGray - previousGray) >= PIXEL_DELTA_THRESHOLD) {
            activePixels += 1;
          }

          comparedPixels += 1;
        }
      }

      return comparedPixels > 0 ? activePixels / comparedPixels : 0;
    };

    const tick = () => {
      animationFrameRef.current = window.requestAnimationFrame(tick);

      const now = performance.now();
      if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) {
        return;
      }

      lastSampleAtRef.current = now;

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      if (!video.videoWidth || !video.videoHeight) {
        return;
      }

      context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const imageData = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const currentFrame = imageData.data;
      const previousFrame = previousFrameRef.current;

      if (!previousFrame) {
        previousFrameRef.current = new Uint8ClampedArray(currentFrame);
        return;
      }

      const leftRatio = detectRegionMotionRatio(
        currentFrame,
        previousFrame,
        leftStartX,
        leftEndX,
      );
      const rightRatio = detectRegionMotionRatio(
        currentFrame,
        previousFrame,
        rightStartX,
        rightEndX,
      );

      previousFrameRef.current = new Uint8ClampedArray(currentFrame);

      if (now < cooldownUntilRef.current) {
        return;
      }

      const side =
        leftRatio >= REGION_MOTION_RATIO_THRESHOLD && leftRatio > rightRatio
          ? "left"
          : rightRatio >= REGION_MOTION_RATIO_THRESHOLD
            ? "right"
            : null;

      if (!side) {
        return;
      }

      const recentPulse = recentPulseRef.current;
      if (
        recentPulse &&
        recentPulse.side === side &&
        now - recentPulse.at <= PULSE_GAP_MS
      ) {
        recentPulseRef.current = null;
        cooldownUntilRef.current = now + TRIGGER_COOLDOWN_MS;
        onTrigger();
        return;
      }

      recentPulseRef.current = { at: now, side };
    };

    tick();

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [active, onTrigger, video]);
}
