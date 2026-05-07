import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CreateModelSceneOptions = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export type ModelSceneController = {
  loadModel: (url: string) => Promise<void>;
  render: (position: { x: number; y: number; scale: number; rotation: number }) => void;
  dispose: () => void;
};

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
  scene.add(root);

  let currentModel: THREE.Object3D | null = null;
  let idleOffset = 0;

  const loader = new GLTFLoader();

  async function loadModel(url: string) {
    const gltf = await loader.loadAsync(url);
    if (currentModel) {
      root.remove(currentModel);
    }

    currentModel = gltf.scene;
    root.add(currentModel);

    const box = new THREE.Box3().setFromObject(currentModel);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    currentModel.position.sub(center);
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const fitScale = 1.7 / maxAxis;
    currentModel.scale.setScalar(fitScale);
    currentModel.rotation.y = Math.PI;
  }

  function render(position: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }) {
    idleOffset += 0.02;

    root.position.set(
      ((position.x / width) * 2 - 1) * 1.2,
      -((position.y / height) * 2 - 1) * 1.8,
      0,
    );
    root.rotation.z = (position.rotation * Math.PI) / 180;
    root.scale.setScalar(position.scale);

    if (currentModel) {
      currentModel.position.y = Math.sin(idleOffset) * 0.08;
      currentModel.rotation.y = Math.PI + Math.sin(idleOffset * 0.8) * 0.12;
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    scene.clear();
  }

  return { loadModel, render, dispose };
}
