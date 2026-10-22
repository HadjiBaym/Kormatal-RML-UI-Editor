export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasPan extends CanvasPoint {}

export interface CanvasViewTransform {
  zoom: number;
  pan: CanvasPan;
}

/** Cursor-anchored zoom: the design-space point under the cursor stays in place. */
export function zoomCanvasAtPoint(
  current: CanvasViewTransform,
  point: CanvasPoint,
  deltaY: number,
  minZoom = 0.1,
  maxZoom = 3,
  sensitivity = 0.0018,
): CanvasViewTransform {
  const worldX = (point.x - current.pan.x) / current.zoom;
  const worldY = (point.y - current.pan.y) / current.zoom;
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, current.zoom * Math.exp(-deltaY * sensitivity)));
  return {
    zoom: nextZoom,
    pan: {
      x: point.x - worldX * nextZoom,
      y: point.y - worldY * nextZoom,
    },
  };
}

/** Wheel and trackpad panning in viewport-space pixels. */
export function panCanvasByWheel(current: CanvasPan, deltaX: number, deltaY: number): CanvasPan {
  return { x: current.x - deltaX, y: current.y - deltaY };
}

/** Pan by a pointer delta, scaled from iframe coordinates into host viewport coordinates. */
export function panCanvasByPointer(
  startPan: CanvasPan,
  deltaX: number,
  deltaY: number,
  scaleX = 1,
  scaleY = 1,
): CanvasPan {
  return { x: startPan.x + deltaX * scaleX, y: startPan.y + deltaY * scaleY };
}
