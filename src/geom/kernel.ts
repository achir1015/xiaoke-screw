// manifold-3d 幾何核心：載入 WASM，並追蹤每次運算產生的物件，建完一個模型後一次釋放。
import Module from 'manifold-3d';
import type { CrossSection as CS, Manifold as M, ManifoldToplevel } from 'manifold-3d';

export type Manifold = M;
export type CrossSection = CS;

let top: ManifoldToplevel | null = null;
const registry: { delete(): void }[] = [];

const MANIFOLD_STATIC = ['cube', 'cylinder', 'sphere', 'extrude', 'revolve', 'compose', 'union', 'difference', 'intersection', 'ofMesh', 'hull'];
const MANIFOLD_MEMBER = ['add', 'subtract', 'intersect', 'warp', 'transform', 'translate', 'rotate', 'scale', 'mirror', 'hull', 'trimByPlane', 'asOriginal', 'simplify'];
const CS_STATIC = ['square', 'circle', 'union', 'difference', 'intersection', 'compose', 'ofPolygons', 'hull'];
const CS_MEMBER = ['add', 'subtract', 'intersect', 'transform', 'translate', 'rotate', 'scale', 'mirror', 'simplify', 'offset', 'hull'];

function intercept(target: Record<string, unknown>, names: string[]) {
  for (const n of names) {
    const fn = target[n];
    if (typeof fn !== 'function') continue;
    target[n] = function (this: unknown, ...args: unknown[]) {
      const r = (fn as (...a: unknown[]) => unknown).apply(this, args);
      if (r && typeof (r as { delete?: unknown }).delete === 'function') registry.push(r as { delete(): void });
      return r;
    };
  }
}

/** 載入 WASM；wasmUrl 在瀏覽器由 Vite 提供，在 Node 測試時省略。 */
export async function initKernel(wasmUrl?: string): Promise<ManifoldToplevel> {
  if (top) return top;
  const m = await Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  m.setup();
  intercept(m.Manifold as unknown as Record<string, unknown>, MANIFOLD_STATIC);
  intercept(m.Manifold.prototype as unknown as Record<string, unknown>, MANIFOLD_MEMBER);
  intercept(m.CrossSection as unknown as Record<string, unknown>, CS_STATIC);
  intercept(m.CrossSection.prototype as unknown as Record<string, unknown>, CS_MEMBER);
  top = m;
  return m;
}

export function K(): ManifoldToplevel {
  if (!top) throw new Error('幾何核心尚未載入');
  return top;
}

/** 釋放這次建模產生的所有 WASM 物件。 */
export function cleanup() {
  for (const o of registry) {
    try {
      o.delete();
    } catch {
      // 已釋放
    }
  }
  registry.length = 0;
}

/** 依直徑與品質決定圓周分段數。 */
export function segmentsFor(diameter: number, quality: Quality): number {
  const len = quality === 'draft' ? 1.4 : quality === 'fine' ? 0.35 : 0.7;
  const n = Math.round((Math.PI * diameter) / len);
  const lo = quality === 'draft' ? 24 : quality === 'fine' ? 64 : 40;
  const hi = quality === 'draft' ? 72 : quality === 'fine' ? 240 : 144;
  return Math.max(lo, Math.min(hi, n));
}

export type Quality = 'draft' | 'normal' | 'fine';
