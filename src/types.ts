export type AssetKind = "image2d" | "model3d";

export type CharacterTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type ImportedAsset = {
  id: string;
  kind: AssetKind;
  name: string;
  objectUrl: string;
  mimeType: string;
};
