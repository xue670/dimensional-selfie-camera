export type AssetDisplaySize = {
  width: number;
  height: number;
};

const MAX_LONG_EDGE = 220;

export function getAssetDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
): AssetDisplaySize {
  if (!naturalWidth || !naturalHeight) {
    return { width: MAX_LONG_EDGE, height: MAX_LONG_EDGE };
  }

  const ratio = Math.min(1, MAX_LONG_EDGE / Math.max(naturalWidth, naturalHeight));

  return {
    width: naturalWidth * ratio,
    height: naturalHeight * ratio,
  };
}
