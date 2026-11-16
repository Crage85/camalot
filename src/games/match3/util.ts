// Small shared helpers for the Whisker Castle views.
import type { PerspectiveCamera } from 'three';

export interface Rect { x: number; y: number; w: number; h: number }

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Every view renders to the full canvas (W x H CSS px). This shifts the picture so the scene centre lands in the
 * middle of `r`, the free area next to the HTML panels.
 */
export function centerIn(cam: PerspectiveCamera, r: Rect, W: number, H: number): void {
  cam.aspect = W / H;
  cam.setViewOffset(W, H, W / 2 - (r.x + r.w / 2), H / 2 - (r.y + r.h / 2), W, H);
}

/** Camera distance at which a w x h rectangle (world units, facing the camera) fills `r`. */
export function fitDistance(cam: PerspectiveCamera, w: number, h: number, r: Rect, W: number, H: number): number {
  const half = Math.tan((cam.fov * Math.PI) / 360);
  return Math.max((h / 2 / half) * (H / r.h), (w / 2 / (half * (W / H))) * (W / r.w));
}
