import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CreateModelSceneOptions = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  onInteractionStateChange?: (state: ModelInteractionState) => void;
};

type RenderTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  depth?: number;
  tilt?: number;
  roll?: number;
};

export type ModelLoadResult = {
  activeClipName: string | null;
  clipNames: string[];
  hasAnimations: boolean;
  responseClipName: string | null;
};

export type ModelResponseResult = {
  activeClipName: string | null;
  mode: "clip" | "fallback" | "unavailable";
};

export type ModelInteractionState = {
  activeClipName: string | null;
  mode: "clip" | "fallback" | null;
  phase: "idle" | "responding";
};

export type ModelSceneController = {
  loadModel: (url: string) => Promise<ModelLoadResult>;
  triggerResponse: () => ModelResponseResult;
  render: (transform: RenderTransform) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

const DEFAULT_IDLE_CLIP_PATTERNS = [/idle/i, /breath/i, /stand/i, /wait/i, /loop/i];
const ANIMATION_BLEND_DURATION = 0.2;
const RESPONSE_CLIP_PATTERNS = [
  /wave/i,
  /greet/i,
  /hello/i,
  /hi/i,
  /happy/i,
  /joy/i,
  /cheer/i,
  /jump/i,
  /react/i,
  /response/i,
  /nod/i,
  /bow/i,
  /look/i,
  /talk/i,
  /thoughtful/i,
  /pose/i,
];

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];

    materials.forEach((material) => material.dispose());
  });
}

function pickDefaultClip(clips: THREE.AnimationClip[]) {
  for (const pattern of DEFAULT_IDLE_CLIP_PATTERNS) {
    const matched = clips.find((clip) => pattern.test(clip.name));
    if (matched) {
      return matched;
    }
  }

  return clips[0] ?? null;
}

function pickResponseClip(clips: THREE.AnimationClip[], idleClip: THREE.AnimationClip | null) {
  const candidates = clips.filter((clip) => clip !== idleClip);

  for (const pattern of RESPONSE_CLIP_PATTERNS) {
    const matched = candidates.find((clip) => pattern.test(clip.name));
    if (matched) {
      return matched;
    }
  }

  return candidates[0] ?? null;
}

export function createModelScene({
  canvas,
  width,
  height,
  onInteractionStateChange,
}: CreateModelSceneOptions): ModelSceneController {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(0, 0, 4);

  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(2, 2, 3);
  scene.add(keyLight);

  const root = new THREE.Group();
  const motionGroup = new THREE.Group();
  scene.add(root);
  root.add(motionGroup);

  let viewportWidth = width;
  let viewportHeight = height;
  let currentModel: THREE.Object3D | null = null;
  let currentMixer: THREE.AnimationMixer | null = null;
  let idleAction: THREE.AnimationAction | null = null;
  let responseAction: THREE.AnimationAction | null = null;
  let activeClipName: string | null = null;
  let responseClipName: string | null = null;
  let hasRuntimeAnimation = false;
  let idleOffset = 0;
  let fallbackResponseTime = 0;
  let fallbackResponseCooldown = 0;

  const loader = new GLTFLoader();
  const clock = new THREE.Clock();

  function emitInteractionState(
    phase: "idle" | "responding",
    mode: "clip" | "fallback" | null,
  ) {
    onInteractionStateChange?.({
      activeClipName,
      mode,
      phase,
    });
  }

  const handleMixerFinished = (event: { action?: THREE.AnimationAction }) => {
    if (!responseAction || event.action !== responseAction) {
      return;
    }

    if (idleAction) {
      // Cross-fade back to idle to avoid a single-frame pose pop between clips.
      idleAction.enabled = true;
      idleAction.reset();
      idleAction.setEffectiveWeight(1);
      idleAction.setEffectiveTimeScale(1);
      idleAction.crossFadeFrom(responseAction, ANIMATION_BLEND_DURATION, false);
      idleAction.play();
      activeClipName = idleAction.getClip().name;
    } else {
      responseAction.stop();
      activeClipName = null;
    }

    emitInteractionState("idle", null);
  };

  function resize(nextWidth: number, nextHeight: number) {
    viewportWidth = nextWidth;
    viewportHeight = nextHeight;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight, false);
  }

  async function loadModel(url: string): Promise<ModelLoadResult> {
    const gltf = await loader.loadAsync(url);

    fallbackResponseTime = 0;
    fallbackResponseCooldown = 0;

    if (currentMixer) {
      currentMixer.removeEventListener("finished", handleMixerFinished);
      currentMixer.stopAllAction();
      currentMixer = null;
    }

    idleAction = null;
    responseAction = null;
    activeClipName = null;
    responseClipName = null;
    emitInteractionState("idle", null);

    if (currentModel) {
      motionGroup.remove(currentModel);
      disposeObject3D(currentModel);
    }

    currentModel = gltf.scene;
    motionGroup.add(currentModel);

    const box = new THREE.Box3().setFromObject(currentModel);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    currentModel.position.sub(center);
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const fitScale = 1.7 / maxAxis;
    currentModel.scale.setScalar(fitScale);
    currentModel.rotation.set(0, 0, 0);

    const clips = gltf.animations ?? [];
    const idleClip = pickDefaultClip(clips);
    const selectedResponseClip = pickResponseClip(clips, idleClip);
    hasRuntimeAnimation = Boolean(idleClip);

    if (idleClip) {
      currentMixer = new THREE.AnimationMixer(currentModel);
      currentMixer.addEventListener("finished", handleMixerFinished);

      idleAction = currentMixer.clipAction(idleClip);
      idleAction.reset();
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.fadeIn(0.2);
      idleAction.play();
      activeClipName = idleClip.name;

      if (selectedResponseClip) {
        responseAction = currentMixer.clipAction(selectedResponseClip);
        responseAction.enabled = true;
        responseAction.clampWhenFinished = true;
        responseClipName = selectedResponseClip.name;
      }
    }

    clock.getDelta();
    emitInteractionState("idle", null);

    return {
      activeClipName,
      clipNames: clips.map((clip) => clip.name),
      hasAnimations: clips.length > 0,
      responseClipName,
    };
  }

  function triggerResponse(): ModelResponseResult {
    if (responseAction && currentMixer) {
      if (idleAction) {
        idleAction.enabled = true;
        idleAction.setEffectiveWeight(1);
        idleAction.setEffectiveTimeScale(1);
        idleAction.fadeOut(ANIMATION_BLEND_DURATION);
      }

      responseAction.stop();
      responseAction.enabled = true;
      responseAction.reset();
      responseAction.setLoop(THREE.LoopOnce, 1);
      responseAction.setEffectiveWeight(1);
      responseAction.setEffectiveTimeScale(1);
      responseAction.fadeIn(ANIMATION_BLEND_DURATION);
      responseAction.play();
      activeClipName = responseAction.getClip().name;
      emitInteractionState("responding", "clip");

      return {
        activeClipName,
        mode: "clip",
      };
    }

    if (currentModel && fallbackResponseCooldown <= 0) {
      fallbackResponseTime = 0.9;
      fallbackResponseCooldown = 0.5;
      emitInteractionState("responding", "fallback");
      return {
        activeClipName: null,
        mode: "fallback",
      };
    }

    return {
      activeClipName,
      mode: currentModel ? "fallback" : "unavailable",
    };
  }

  function render(transform: RenderTransform) {
    const delta = clock.getDelta();
    idleOffset += delta * 1.4;
    const previousFallbackResponseTime = fallbackResponseTime;
    fallbackResponseTime = Math.max(0, fallbackResponseTime - delta);
    fallbackResponseCooldown = Math.max(0, fallbackResponseCooldown - delta);

    if (previousFallbackResponseTime > 0 && fallbackResponseTime === 0) {
      emitInteractionState("idle", null);
    }

    root.position.set(
      ((transform.x / viewportWidth) * 2 - 1) * 1.2,
      -((transform.y / viewportHeight) * 2 - 1) * 1.8,
      transform.depth ?? 0,
    );
    root.rotation.set(
      transform.tilt ?? 0,
      (transform.rotation * Math.PI) / 180,
      transform.roll ?? 0,
    );
    root.scale.setScalar(transform.scale);

    if (currentMixer) {
      currentMixer.update(delta);
    }

    if (currentModel) {
      const baseBob = hasRuntimeAnimation ? 0 : Math.sin(idleOffset) * 0.08;
      const baseTurn = hasRuntimeAnimation ? 0 : Math.sin(idleOffset * 0.8) * 0.12;
      const responseProgress = fallbackResponseTime > 0 ? 1 - fallbackResponseTime / 0.9 : 0;
      const responseEase = fallbackResponseTime > 0 ? Math.sin(responseProgress * Math.PI) : 0;
      const responseNod =
        fallbackResponseTime > 0
          ? Math.sin(responseProgress * Math.PI * 2) * Math.sin(responseProgress * Math.PI)
          : 0;

      motionGroup.position.y = baseBob + responseEase * (hasRuntimeAnimation ? 0.05 : 0.09);
      motionGroup.position.z = responseEase * 0.18;
      motionGroup.rotation.y = baseTurn + responseEase * 0.08;
      motionGroup.rotation.x = -responseEase * 0.16 - responseNod * 0.14;
      motionGroup.rotation.z = responseEase * 0.04;
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    if (currentMixer) {
      currentMixer.removeEventListener("finished", handleMixerFinished);
      currentMixer.stopAllAction();
    }

    if (currentModel) {
      disposeObject3D(currentModel);
    }

    renderer.dispose();
    scene.clear();
  }

  return { loadModel, triggerResponse, render, resize, dispose };
}
