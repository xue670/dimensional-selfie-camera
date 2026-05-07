import { useEffect, useMemo, useRef, useState } from "react";
import { captureScene } from "./modules/capture/captureScene";
import { getAssetDisplaySize, type AssetDisplaySize } from "./modules/assets/displaySize";
import { mapFileToAsset } from "./modules/assets/fileHelpers";
import { useCamera } from "./modules/camera/useCamera";
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
const ROTATE_STEP = 8;

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

  const [asset, setAsset] = useState<ImportedAsset | null>(null);
  const [transform, setTransform] = useState<CharacterTransform>(DEFAULT_TRANSFORM);
  const [imageSize, setImageSize] = useState<AssetDisplaySize>({ width: 220, height: 220 });
  const [message, setMessage] = useState("准备好后，开启前摄并导入角色。");
  const [captureUrl, setCaptureUrl] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void startCamera();
  }, [startCamera]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

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
    });
    modelSceneRef.current = controller;

    const renderLoop = () => {
      controller.render(transformRef.current);
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
      .then(() => setMessage(`已载入模型：${asset.name}`))
      .catch(() => setMessage("模型加载失败，试试一个体积更小的 GLB。"));
  }, [asset]);

  const canCapture = status === "ready";

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

  function nudgeTransform(patch: Partial<CharacterTransform>) {
    setTransform((current) => ({ ...current, ...patch }));
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
      if (previous) {
        URL.revokeObjectURL(previous.objectUrl);
      }
      return nextAsset;
    });
    setTransform(DEFAULT_TRANSFORM);
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
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setMessage("已触发保存下载。");
    } catch {
      setMessage("保存失败了，请稍后再试。");
    }
  }

  function handlePointerDown() {
    setDragging(true);
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
            <p className="eyebrow">V0.1 自拍合影</p>
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
          <button
            className="shutter-button"
            disabled={!canCapture}
            onClick={handleCapture}
            type="button"
          >
            自拍
          </button>
        </div>

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
          <button onClick={() => nudgeTransform({ scale: Math.max(0.3, transform.scale - SCALE_STEP) })} type="button">
            缩小
          </button>
          <button onClick={() => nudgeTransform({ scale: Math.min(2.4, transform.scale + SCALE_STEP) })} type="button">
            放大
          </button>
          <button onClick={() => nudgeTransform({ rotation: transform.rotation - ROTATE_STEP })} type="button">
            左转
          </button>
          <button onClick={() => nudgeTransform({ rotation: transform.rotation + ROTATE_STEP })} type="button">
            右转
          </button>
        </div>

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
