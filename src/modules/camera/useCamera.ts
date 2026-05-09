import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "insecure"
  | "unsupported"
  | "denied"
  | "error";

type UseCameraResult = {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  errorMessage: string;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
};

const FRONT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "user" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const desiredActiveRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const stopCamera = useCallback(() => {
    desiredActiveRef.current = false;

    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    desiredActiveRef.current = true;

    if (!window.isSecureContext) {
      setStatus("insecure");
      setErrorMessage("当前页面不是安全环境。请改用 HTTPS 地址，或在设备本机的 localhost 中打开。");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorMessage("当前浏览器环境不支持相机 API。请改用新版 Chrome、Safari 或其他系统浏览器。");
      return;
    }

    setStatus("requesting");
    setErrorMessage("");

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia(
        FRONT_CAMERA_CONSTRAINTS,
      );

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        setStatus("error");
        setErrorMessage("视频组件尚未就绪。");
        return;
      }

      video.srcObject = stream;
      await video.play();
      setStatus("ready");
    } catch (error) {
      let nextStatus: CameraStatus = "error";
      let message = "相机启动失败，请检查浏览器权限或设备占用情况。";

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          nextStatus = "denied";
          message = "需要相机权限才能开始自拍。请在浏览器设置里允许访问相机。";
        } else if (error.name === "NotFoundError") {
          message = "没有检测到可用摄像头。";
        } else if (error.name === "NotReadableError") {
          message = "相机暂时被其他应用占用，请稍后再试。";
        }
      }

      setStatus(nextStatus);
      setErrorMessage(message);
    }
  }, []);

  useEffect(() => {
    const scheduleRestart = () => {
      if (!desiredActiveRef.current || document.visibilityState !== "visible") {
        return;
      }

      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
      }

      restartTimerRef.current = window.setTimeout(() => {
        void startCamera();
      }, 180);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }

      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        scheduleRestart();
      }
    };

    const handlePageShow = () => {
      scheduleRestart();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return useMemo(
    () => ({ videoRef, status, errorMessage, startCamera, stopCamera }),
    [errorMessage, startCamera, status, stopCamera],
  );
}
