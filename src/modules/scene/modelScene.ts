import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CreateModelSceneOptions = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

type RenderTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type ModelLoadResult = {
  activeClipName: string | null;
  clipNames: string[];
  hasAnimations: boolean;
};

export type ModelSceneController = {
  loadModel: (url: string) => Promise<ModelLoadResult>;
  render: (transform: RenderTransform) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

const DEFAULT_IDLE_CLIP_PATTERNS = [/idle/i, /breath/i, /stand/i, /wait/i, /loop/i];

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

export function createModelScene({
  canvas,
  width,
  height,
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
  let currentAction: THREE.AnimationAction | null = null;
  let hasRuntimeAnimation = false;
  let idleOffset = 0;

  const loader = new GLTFLoader();
  const clock = new THREE.Clock();

  function resize(nextWidth: number, nextHeight: number) {
    viewportWidth = nextWidth;
    viewportHeight = nextHeight;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight, false);
  }

  async function loadModel(url: string): Promise<ModelLoadResult> {
    const gltf = await loader.loadAsync(url);

    if (currentAction) {
      currentAction.stop();
      currentAction = null;
    }

    if (currentMixer) {
      currentMixer.stopAllAction();
      currentMixer = null;
    }

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
    const defaultClip = pickDefaultClip(clips);
    hasRuntimeAnimation = Boolean(defaultClip);

    if (defaultClip) {
      currentMixer = new THREE.AnimationMixer(currentModel);
      currentAction = currentMixer.clipAction(defaultClip);
      currentAction.reset();
      currentAction.setLoop(THREE.LoopRepeat, Infinity);
      currentAction.fadeIn(0.2);
      currentAction.play();
    }

    clock.getDelta();

    return {
      activeClipName: defaultClip?.name ?? null,
      clipNames: clips.map((clip) => clip.name),
      hasAnimations: clips.length > 0,
    };
  }

  function render(transform: RenderTransform) {
    const delta = clock.getDelta();
    idleOffset += delta * 1.4;

    root.position.set(
      ((transform.x / viewportWidth) * 2 - 1) * 1.2,
      -((transform.y / viewportHeight) * 2 - 1) * 1.8,
      0,
    );
    root.rotation.set(0, (transform.rotation * Math.PI) / 180, 0);
    root.scale.setScalar(transform.scale);

    if (currentMixer) {
      currentMixer.update(delta);
    }

    if (currentModel) {
      if (hasRuntimeAnimation) {
        motionGroup.position.y = 0;
        motionGroup.rotation.y = 0;
      } else {
        motionGroup.position.y = Math.sin(idleOffset) * 0.08;
        motionGroup.rotation.y = Math.sin(idleOffset * 0.8) * 0.12;
      }
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    if (currentAction) {
      currentAction.stop();
    }

    if (currentMixer) {
      currentMixer.stopAllAction();
    }

    if (currentModel) {
      disposeObject3D(currentModel);
    }

    renderer.dispose();
    scene.clear();
  }

  return { loadModel, render, resize, dispose };
}
