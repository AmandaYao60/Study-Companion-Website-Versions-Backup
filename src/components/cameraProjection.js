/** Project normalized landmarks through centered object-cover, matching the mirrored video. */
export const createCoverProjection = (sourceWidth, sourceHeight, viewportWidth, viewportHeight, { mirrored = true } = {}) => {
  if (![sourceWidth, sourceHeight, viewportWidth, viewportHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (viewportWidth - scaledWidth) / 2;
  const offsetY = (viewportHeight - scaledHeight) / 2;
  return (point) => ({
    x: (mirrored ? 1 - point.x : point.x) * scaledWidth + offsetX,
    y: point.y * scaledHeight + offsetY,
  });
};
