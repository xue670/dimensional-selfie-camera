import { useEffect, useMemo, useRef, useState } from "react";
import { captureScene } from "./modules/capture/captureScene";
import { getAssetDisplaySize, type AssetDisplaySize } from "./modules/assets/displaySize";
import { mapFileToAsset } from "./modules/assets/fileHelpers";
import { useCamera } from "./modules/camera/useCamera";
import { useWaveTrigger } from "./modules/interaction/useWaveTrigger";
import { createModelScene } from "./modules/scene/modelScene";
import type { CharacterTransform, ImportedAsset } from "./types";

const DEFAULT_TRANSFORM: CharacterTransform = {
  x: 220,
  y: 360,
  scale: 1,
  rotation: 0,
};

const TRANSFORM_STEP = 18;
const SCALE_STEP = 0.08;
const MIN_SCALE = 0.3;
const MAX_SCALE = 5.6;
const ROTATE_STEP = 8;
const MODEL_ANGLE_PRESETS = [0, 90, 180, 270];
const BUNDLED_DEFAULT_MODEL_URL = "/models/default.glb";
const BUNDLED_DEFAULT_MODEL_NAME = "默认模型";
const MODEL_TAP_TRIGGER_BASE_WIDTH = 190;
const MODEL_TAP_TRIGGER_BASE_HEIGHT = 240;
const MODEL_TAP_MAX_DURATION = 260;
const MODEL_TAP_MAX_MOVEMENT = 18;

type CompanionSlot = "free" | "left" | "right";
type InteractionPhase = "idle" | "responding";
type InteractionMode = "clip" | "fallback" | null;

function getCompanionRenderAdjustments(slot: CompanionSlot) {
  if (slot === "left") {
    return {
      depth: 0.62,
      tilt: -0.24,
      roll: 0.18,
    };
  }

  if (slot === "right") {
    return {
      depth: 0.62,
      tilt: -0.24,
      roll: -0.18,
    };
  }

  return {
    depth: 0,
    tilt: 0,
    roll: 0,
  };
}

function App() {
  const { videoRef, status, errorMessage, startCamera } = useCamera();
  const stageRef = useRef<HTMLDivElement>(null);
  const modelCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewRef = useRef<HTMLImageElement | null>(null);
  const modelSceneRef = useRef<ReturnType<typeof createModelScene> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const transformRef = useRef<CharacterTransform>(DEFAULT_TRANSFORM);
  const companionSlotRef = useRef<CompanionSlot>("free");
  const assetKindRef = useRef<ImportedAsset["kind"] | null>(null);
  const modelTapStartRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const [asset, setAsset] = useState<ImportedAsset | null>(null);
  const [transform, setTransform] = useState<CharacterTransform>(DEFAULT_TRANSFORM);
  const [imageSize, setImageSize] = useState<AssetDisplaySize>({ width: 220, height: 220 });
  const [message, setMessage] = useState("准备好后，开启前摄并导入角色。");
  const [captureUrl, setCaptureUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [companionSlot, setCompanionSlot] = useState<CompanionSlot>("free");
  const [interactionPhase, setInteractionPhase] = useState<InteractionPhase>("idle");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [lastTriggerSource, setLastTriggerSource] = useState<"button" | "tap" | "wave" | null>(null);

  useEffect(() => {
    void startCamera();
  }, [startCamera]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    companionSlotRef.current = companionSlot;
  }, [companionSlot]);

  useEffect(() => {
    assetKindRef.current = asset?.kind ?? null;
  }, [asset]);

  useEffect(() => {
    return () => {
      if (asset?.objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(asset.objectUrl);
      }
    };
  }, [asset]);

  useEffect(() => {
    const canvas = modelCanvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) {
      return;
    }

    const controller = createModelScene({
      canvas,
      width: stage.clientWidth,
      height: stage.clientHeight,
      onInteractionStateChange: (state) => {
        setInteractionPhase(state.phase);
        setInteractionMode(state.mode);
      },
    });
    modelSceneRef.current = controller;

    const renderLoop = () => {
      const companionAdjustments = getCompanionRenderAdjustments(companionSlotRef.current);
      const renderTransform =
        assetKindRef.current === "model3d" && companionSlotRef.current !== "free"
          ? {
              ...transformRef.current,
              ...companionAdjustments,
            }
          : transformRef.current;

      controller.render(renderTransform);
      animationFrameRef.current = window.requestAnimationFrame(renderLoop);
    };

    const resizeScene = () => {
      canvas.width = stage.clientWidth;
      canvas.height = stage.clientHeight;
      controller.resize(stage.clientWidth, stage.clientHeight);
    };

    resizeScene();
    window.addEventListener("resize", resizeScene);
    renderLoop();

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", resizeScene);
      controller.dispose();
    };
  }, []);

  useEffect(() => {
    if (!modelSceneRef.current) {
      return;
    }

    modelSceneRef.current.render(transform);
  }, [transform]);

  useEffect(() => {
    if (asset?.kind !== "model3d" || !modelSceneRef.current) {
      return;
    }

    void modelSceneRef.current
      .loadModel(asset.objectUrl)
      .then((result) => {
        if (result.responseClipName) {
          setMessage(
            `已载入模型：${asset.name}，待机动作：${result.activeClipName ?? "未命名"}，互动动作：${result.responseClipName}`,
          );
          return;
        }

        if (result.activeClipName) {
          setMessage(`已载入模型：${asset.name}，正在播放动作：${result.activeClipName}`);
          return;
        }

        if (result.hasAnimations) {
          setMessage(`已载入模型：${asset.name}，检测到动画但未匹配到默认待机动作。`);
          return;
        }

        setMessage(`已载入模型：${asset.name}，当前使用轻量待机效果。`);
      })
      .catch(() =>
        setMessage(
          asset.objectUrl === BUNDLED_DEFAULT_MODEL_URL
            ? "默认模型还没打包进项目。请把 GLB 放到 public/models/default.glb。"
            : "模型加载失败，试试一个体积更小的 GLB。",
        ),
      );
  }, [asset]);

  const canCapture = status === "ready";
  const canTriggerResponse = asset?.kind === "model3d" && interactionPhase !== "responding";
  const responseButtonLabel = interactionPhase === "responding" ? "回应中..." : "互动一下";

  const heroStyle = useMemo(
    () => ({
      left: `${transform.x}px`,
      top: `${transform.y}px`,
      width: `${imageSize.width}px`,
      height: `${imageSize.height}px`,
      transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
    }),
    [imageSize.height, imageSize.width, transform],
  );

  function applyCompanionSlot(slot: CompanionSlot) {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    if (slot === "free") {
      setCompanionSlot("free");
      setMessage("已切回自由摆放模式。");
      return;
    }

    const nextTransform: CharacterTransform = {
      x:
        slot === "left"
          ? stage.clientWidth * 0.15 - TRANSFORM_STEP
          : stage.clientWidth * 0.85 + TRANSFORM_STEP,
      y: stage.clientHeight * 0.8 + TRANSFORM_STEP * 2,
      scale: 1.22 + SCALE_STEP,
      rotation: slot === "left" ? 28 : 332,
    };

    setCompanionSlot(slot);
    setTransform(nextTransform);
    setMessage(slot === "left" ? "已切到左下陪伴位。" : "已切到右下陪伴位。");
  }

  function nudgeTransform(patch: Partial<CharacterTransform>) {
    setTransform((current) => ({ ...current, ...patch }));
  }

  function setRotationAngle(angle: number) {
    setTransform((current) => ({ ...current, rotation: angle }));
  }

  function getNormalizedAngle(angle: number) {
    const normalized = ((angle % 360) + 360) % 360;
    return normalized === 360 ? 0 : normalized;
  }

  function handleImageImportClick() {
    imageInputRef.current?.click();
  }

  function handleModelImportClick() {
    modelInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextAsset = mapFileToAsset(file);
    if (!nextAsset) {
      setMessage("当前版本只支持 PNG、JPG 和 GLB 文件。");
      return;
    }

    setAsset((previous) => {
      if (previous?.objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previous.objectUrl);
      }
      return nextAsset;
    });
    setInteractionPhase("idle");
    setInteractionMode(null);
    setTransform(DEFAULT_TRANSFORM);
    setCompanionSlot("free");
    setCaptureUrl("");

    if (nextAsset.kind === "image2d") {
      const image = new Image();
      image.src = nextAsset.objectUrl;
      image.onload = () => {
        imagePreviewRef.current = image;
        setImageSize(getAssetDisplaySize(image.naturalWidth, image.naturalHeight));
        setMessage(`已载入图片：${nextAsset.name}`);
      };
    } else {
      setMessage(`正在载入 3D 模型：${nextAsset.name}`);
    }

    event.target.value = "";
  }

  function handleTriggerResponse(source: "button" | "tap" | "wave" = "button") {
    if (!modelSceneRef.current || asset?.kind !== "model3d") {
      return;
    }

    const result = modelSceneRef.current.triggerResponse();
    if (result.mode === "clip") {
      setLastTriggerSource(source);
      if (source !== "wave") {
        setMessage(
          source === "tap"
            ? `你碰了一下角色，正在播放动作：${result.activeClipName}`
            : `角色回应了你，正在播放动作：${result.activeClipName}`,
        );
      }
      return;
    }

    if (result.mode === "fallback") {
      setLastTriggerSource(source);
      if (source !== "wave") {
        setMessage(
          source === "tap"
            ? "你碰了一下角色，当前使用轻量点头互动。"
            : "角色回应了你，当前使用轻量点头互动。",
        );
      }
      return;
    }

    setMessage("当前模型还没有可用的互动动作。");
  }

  function handleBundledModelLoad() {
    setAsset((previous) => {
      if (previous?.objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previous.objectUrl);
      }

      return {
        id: `model3d-bundled-${Date.now()}`,
        kind: "model3d",
        name: BUNDLED_DEFAULT_MODEL_NAME,
        objectUrl: BUNDLED_DEFAULT_MODEL_URL,
        mimeType: "model/gltf-binary",
      };
    });
    setInteractionPhase("idle");
    setInteractionMode(null);
    setLastTriggerSource(null);
    applyCompanionSlot("left");
    setCaptureUrl("");
    setMessage("正在加载默认模型...");
  }

  useWaveTrigger({
    active: canTriggerResponse && status === "ready",
    video: videoRef.current,
    onTrigger: () => {
      handleTriggerResponse("wave");
    },
  });

  function getStagePoint(event: React.PointerEvent<HTMLElement>) {
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) {
      return null;
    }

    return {
      x: event.clientX - stageRect.left,
      y: event.clientY - stageRect.top,
    };
  }

  function isPointInsideModelTriggerArea(point: { x: number; y: number }) {
    const hitWidth = MODEL_TAP_TRIGGER_BASE_WIDTH * transform.scale;
    const hitHeight = MODEL_TAP_TRIGGER_BASE_HEIGHT * transform.scale;
    const withinX = Math.abs(point.x - transform.x) <= hitWidth / 2;
    const withinY = Math.abs(point.y - transform.y) <= hitHeight / 2;
    return withinX && withinY;
  }

  function handleModelStagePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (asset?.kind !== "model3d") {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".top-bar") || target.closest(".guidance-card")) {
      modelTapStartRef.current = null;
      return;
    }

    const point = getStagePoint(event);
    if (!point || !isPointInsideModelTriggerArea(point)) {
      modelTapStartRef.current = null;
      return;
    }

    modelTapStartRef.current = {
      ...point,
      at: performance.now(),
    };
  }

  function handleModelStagePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (asset?.kind !== "model3d" || !modelTapStartRef.current || !canTriggerResponse) {
      modelTapStartRef.current = null;
      return;
    }

    const point = getStagePoint(event);
    if (!point) {
      modelTapStartRef.current = null;
      return;
    }

    const deltaX = point.x - modelTapStartRef.current.x;
    const deltaY = point.y - modelTapStartRef.current.y;
    const distance = Math.hypot(deltaX, deltaY);
    const duration = performance.now() - modelTapStartRef.current.at;
    const isTap =
      distance <= MODEL_TAP_MAX_MOVEMENT &&
      duration <= MODEL_TAP_MAX_DURATION &&
      isPointInsideModelTriggerArea(point);

    modelTapStartRef.current = null;

    if (isTap) {
      handleTriggerResponse("tap");
    }
  }

  function handleCapture() {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) {
      return;
    }

    try {
      const dataUrl = captureScene({
        video,
        overlayCanvas: asset?.kind === "model3d" ? modelCanvasRef.current : null,
        imageElement: asset?.kind === "image2d" ? imagePreviewRef.current : null,
        transform,
        viewport: {
          width: stage.clientWidth,
          height: stage.clientHeight,
        },
      });

      setCaptureUrl(dataUrl);
      setMessage("自拍完成，可以直接保存到本地。");
    } catch {
      setMessage("导出失败了，稍后再试一次。");
    }
  }

  async function handleSave() {
    if (!captureUrl) {
      return;
    }

    try {
      const response = await fetch(captureUrl);
      const blob = await response.blob();
      const file = new File([blob], `dimensional-selfie-${Date.now()}.png`, {
        type: "image/png",
      });

      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "次元自拍相机",
        });
        setMessage("已打开系统分享面板。");
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.name;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setMessage("已触发保存下载。如果没有立刻看到图片，请检查下载列表或系统相册。");
    } catch {
      setMessage("保存失败了，请稍后再试。");
    }
  }

  function handlePointerDown() {
    setDragging(true);
    setCompanionSlot("free");
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || asset?.kind !== "image2d") {
      return;
    }

    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) {
      return;
    }

    setTransform((current) => ({
      ...current,
      x: event.clientX - stage.left,
      y: event.clientY - stage.top,
    }));
  }

  function handlePointerUp() {
    setDragging(false);
  }

  return (
    <main className="app-shell">
      <section className="camera-stage" ref={stageRef}>
        <video
          className="camera-feed"
          ref={videoRef}
          playsInline
          muted
          autoPlay
        />

        <canvas className="model-layer" ref={modelCanvasRef} />

        <div
          className="camera-stage-touch"
          onPointerCancel={() => {
            modelTapStartRef.current = null;
          }}
          onPointerDown={handleModelStagePointerDown}
          onPointerUp={handleModelStagePointerUp}
        />

        {asset?.kind === "image2d" ? (
          <div
            className="image-layer"
            style={heroStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <img alt={asset.name} src={asset.objectUrl} />
          </div>
        ) : null}

        <header className="top-bar">
          <div>
            <p className="eyebrow">V0.2 效果验证中</p>
            <h1>次元自拍相机</h1>
          </div>
          <span className={`status-chip status-${status}`}>
            {status === "ready" ? "前摄已就绪" : "等待相机"}
          </span>
        </header>

        <div className="guidance-card">
          <p>{errorMessage || message}</p>
        </div>
      </section>

      <section className="control-panel">
        <input
          hidden
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleFileChange}
          ref={imageInputRef}
          type="file"
        />
        <input
          hidden
          accept=".glb,model/gltf-binary,application/octet-stream,*/*"
          onChange={handleFileChange}
          ref={modelInputRef}
          type="file"
        />

        <div className="primary-actions">
          <button className="tool-button" onClick={handleImageImportClick} type="button">
            导入图片
          </button>
          <button className="tool-button" onClick={handleModelImportClick} type="button">
            导入3D模型
          </button>
          <button className="tool-button" onClick={handleBundledModelLoad} type="button">
            默认模型
          </button>
          <button
            className="shutter-button"
            disabled={!canCapture}
            onClick={handleCapture}
            type="button"
          >
            自拍
          </button>
        </div>

        {asset?.kind === "model3d" ? (
          <div className="scene-presets">
            <button
              className={companionSlot === "left" ? "preset-active" : ""}
              onClick={() => applyCompanionSlot("left")}
              type="button"
            >
              左下陪伴位
            </button>
            <button
              className={companionSlot === "right" ? "preset-active" : ""}
              onClick={() => applyCompanionSlot("right")}
              type="button"
            >
              右下陪伴位
            </button>
            <button
              className={companionSlot === "free" ? "preset-active" : ""}
              onClick={() => applyCompanionSlot("free")}
              type="button"
            >
              自由摆放
            </button>
            <button
              className="respond-button"
              disabled={!canTriggerResponse}
              onClick={() => handleTriggerResponse("button")}
              type="button"
            >
              {responseButtonLabel}
            </button>
          </div>
        ) : null}

        {asset?.kind === "model3d" ? (
          <div className="interaction-hint">
            <span className={`interaction-chip interaction-${interactionPhase}`}>
              {interactionPhase === "responding"
                ? interactionMode === "clip"
                  ? "响应动画播放中"
                  : "轻量回应中"
                : "待机中"}
            </span>
            <p>
              {interactionPhase === "responding"
                ? interactionMode === "clip"
                  ? "当前模型正在播放响应动作，结束后会自动回到 idle。"
                  : "当前模型没有独立响应 clip，已回退到更自然的轻量点头回应。"
                : lastTriggerSource === "wave"
                  ? "当前角色处于 idle 待机状态，可以挥手、点一下角色，或点击按钮再次触发回应。"
                  : "当前角色处于 idle 待机状态，可以挥手、点一下角色，或点击按钮触发回应。"}
            </p>
          </div>
        ) : null}

        <div className="adjust-grid">
          <button onClick={() => nudgeTransform({ y: transform.y - TRANSFORM_STEP })} type="button">
            上移
          </button>
          <button onClick={() => nudgeTransform({ y: transform.y + TRANSFORM_STEP })} type="button">
            下移
          </button>
          <button onClick={() => nudgeTransform({ x: transform.x - TRANSFORM_STEP })} type="button">
            左移
          </button>
          <button onClick={() => nudgeTransform({ x: transform.x + TRANSFORM_STEP })} type="button">
            右移
          </button>
          <button onClick={() => nudgeTransform({ scale: Math.max(MIN_SCALE, transform.scale - SCALE_STEP) })} type="button">
            缩小
          </button>
          <button onClick={() => nudgeTransform({ scale: Math.min(MAX_SCALE, transform.scale + SCALE_STEP) })} type="button">
            放大
          </button>
          <button onClick={() => nudgeTransform({ rotation: transform.rotation - ROTATE_STEP })} type="button">
            左转
          </button>
          <button onClick={() => nudgeTransform({ rotation: transform.rotation + ROTATE_STEP })} type="button">
            右转
          </button>
        </div>

        {asset?.kind === "model3d" ? (
          <div className="angle-panel">
            <p>模型朝向：{getNormalizedAngle(transform.rotation)}°</p>
            <div className="angle-grid">
              {MODEL_ANGLE_PRESETS.map((angle) => (
                <button
                  className={getNormalizedAngle(transform.rotation) === angle ? "angle-active" : ""}
                  key={angle}
                  onClick={() => setRotationAngle(angle)}
                  type="button"
                >
                  {angle}°
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {captureUrl ? (
          <div className="capture-preview">
            <img alt="自拍结果" src={captureUrl} />
            <button className="save-button" onClick={handleSave} type="button">
              保存到本地
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
