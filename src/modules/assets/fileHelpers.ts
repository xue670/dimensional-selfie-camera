import type { AssetKind, ImportedAsset } from "../../types";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const MODEL_EXTENSIONS = [".glb"];

function getAssetKind(file: File): AssetKind | null {
  const lower = file.name.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return "image2d";
  }
  if (MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return "model3d";
  }
  return null;
}

export function mapFileToAsset(file: File): ImportedAsset | null {
  const kind = getAssetKind(file);
  if (!kind) {
    return null;
  }

  return {
    id: `${kind}-${Date.now()}`,
    kind,
    name: file.name,
    objectUrl: URL.createObjectURL(file),
    mimeType: file.type,
  };
}
