// 螺紋：牙型（軸向剖面）與沿螺旋線掃出的實體。
//
// 做法：把一個螺距內的牙型點（z 偏移、半徑）沿圓周每一格往上抬「導程 × 角度比例」，
// 相鄰兩格同一個牙型點連成一條螺旋帶，整圈接回時錯開一個導程。這樣牙型的稜線
// 剛好落在網格邊上，牙頂、牙底都是精確的平面，三角形也比均勻切層少很多。
// 兩端用軸心的扇形封起來，再用布林運算切成需要的長度（端面封口一律被切掉）。
import { K, type Manifold } from './kernel';

export type ProfileKind = 'metric' | 'trapezoid' | 'square' | 'round';

export interface ThreadSpec {
  /** 外徑（大徑），mm */
  d: number;
  /** 螺距，mm */
  pitch: number;
  /** 線數（導程 = 線數 × 螺距） */
  starts: number;
  profile: ProfileKind;
  /** 梯形牙：牙型角（兩側面夾角），度 */
  flankAngle: number;
  /** 梯形／方牙／圓牙：牙高 = 係數 × 螺距 */
  depthFactor: number;
  /** 梯形牙：牙頂平台占可用寬度的比例 0..1 */
  crestFlat: number;
  /** 牙型轉角圓角半徑，mm */
  fillet: number;
}

/** 牙高（mm）。 */
export function threadDepth(t: ThreadSpec): number {
  if (t.profile === 'metric') return 0.5413 * t.pitch; // ISO 68-1：5/8 H
  const f = t.profile === 'square' ? 0.5 : t.depthFactor;
  return Math.max(0.05, Math.min(0.75, f)) * t.pitch;
}

/** 牙型在一個螺距內的折線：u 為 0..1（沿軸向占螺距比例），h 為 0..1（0 = 牙底，1 = 牙頂）。從牙底中央開始。 */
function rawProfile(t: ThreadSpec): [number, number][] {
  if (t.profile === 'round') {
    const n = 20;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      pts.push([u, (1 - Math.cos(2 * Math.PI * u)) / 2]);
    }
    return pts;
  }
  let root: number, flank: number, crest: number;
  if (t.profile === 'metric') {
    root = 0.25;
    flank = 0.3125;
    crest = 0.125;
  } else {
    const angle = t.profile === 'square' ? 6 : Math.max(0, Math.min(120, t.flankAngle));
    const dp = threadDepth(t) / t.pitch;
    flank = Math.min(0.48, dp * Math.tan(((angle / 2) * Math.PI) / 180));
    const rest = 1 - 2 * flank;
    const cf = t.profile === 'square' ? 0.5 : Math.max(0, Math.min(1, t.crestFlat));
    crest = rest * cf;
    root = rest - crest;
  }
  // 從牙底平台的中央開始，轉角都在內部
  const h = root / 2;
  return [
    [0, 0],
    [h, 0],
    [h + flank, 1],
    [h + flank + crest, 1],
    [h + 2 * flank + crest, 0],
  ];
}

/** 一個螺距內的牙型點（mm）：z 由 0 遞增到小於 pitch，r 為半徑（以小徑為 0 的高度另外加）。 */
export function profilePoints(t: ThreadSpec): { z: number; h: number }[] {
  const depth = threadDepth(t);
  const P = t.pitch;
  const raw = rawProfile(t).map(([u, h]) => ({ z: u * P, h: h * depth }));
  if (t.profile === 'round' || t.fillet <= 0) return dedupe(raw, P);
  // 圓角：每個轉角用二次貝茲曲線取代（前後各退一段距離），首尾視為週期
  const closed = [...raw, { z: P, h: 0 }];
  const out: { z: number; h: number }[] = [closed[0]];
  for (let i = 1; i < closed.length - 1; i++) {
    const a = closed[i - 1], b = closed[i], c = closed[i + 1];
    const l1 = Math.hypot(b.z - a.z, b.h - a.h), l2 = Math.hypot(c.z - b.z, c.h - b.h);
    const turn = Math.abs((b.z - a.z) * (c.h - b.h) - (b.h - a.h) * (c.z - b.z)) / (l1 * l2 || 1);
    if (turn < 1e-6 || l1 < 1e-9 || l2 < 1e-9) {
      out.push(b);
      continue;
    }
    const cut = Math.min(t.fillet, l1 * 0.45, l2 * 0.45);
    const p0 = { z: b.z + ((a.z - b.z) * cut) / l1, h: b.h + ((a.h - b.h) * cut) / l1 };
    const p2 = { z: b.z + ((c.z - b.z) * cut) / l2, h: b.h + ((c.h - b.h) * cut) / l2 };
    const n = 4;
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      out.push({
        z: (1 - s) * (1 - s) * p0.z + 2 * (1 - s) * s * b.z + s * s * p2.z,
        h: (1 - s) * (1 - s) * p0.h + 2 * (1 - s) * s * b.h + s * s * p2.h,
      });
    }
  }
  return dedupe(out, P);
}

function dedupe(pts: { z: number; h: number }[], P: number) {
  const out: { z: number; h: number }[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.z - p.z) < 1e-6 && Math.abs(last.h - p.h) < 1e-6) continue;
    if (p.z >= P - 1e-6) continue;
    out.push(p);
  }
  return out;
}

/**
 * 螺紋實體（含實心芯），沿 +Z 從 z0 到 z1 之外再多出一點；相位以 z = 0 為準，
 * 所以同一組參數做出的公螺紋與母螺紋切刀在任何「螺距整數倍」的位置都能咬合。
 * grow：半徑整體加大（母螺紋的配合間隙）。
 */
export function threadSolid(t: ThreadSpec, z0: number, z1: number, segments: number, grow = 0): Manifold {
  const { Manifold, Mesh } = K();
  const P = t.pitch;
  const starts = Math.max(1, Math.round(t.starts));
  const lead = P * starts;
  const prof = profilePoints(t);
  const nb = prof.length;
  const rMin = t.d / 2 - threadDepth(t) + grow;
  const N = Math.max(12, segments);
  // 起點往下多一個導程，終點往上多一個導程，封口都會被切掉
  const k0 = Math.floor((z0 - 2 * lead) / P);
  const k1 = Math.ceil((z1 + lead) / P);
  const S = (k1 - k0) * nb;
  const off = nb * starts;
  if (S <= off + 2) throw new Error('螺紋太短');
  const verts = new Float32Array((N * S + 2) * 3);
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N;
    const c = Math.cos(th), s = Math.sin(th);
    const lift = (lead * i) / N;
    for (let j = 0; j < S; j++) {
      const p = prof[j % nb];
      const z = (k0 + Math.floor(j / nb)) * P + p.z + lift;
      const r = rMin + p.h;
      const v = (i * S + j) * 3;
      verts[v] = r * c;
      verts[v + 1] = r * s;
      verts[v + 2] = z;
    }
  }
  const tris: number[] = [];
  const V = (i: number, j: number) => i * S + j;
  for (let i = 0; i < N; i++) {
    const ni = (i + 1) % N;
    const o = i === N - 1 ? off : 0;
    for (let j = 0; j + o + 1 < S; j++) {
      const a = V(i, j), b = V(ni, j + o), c = V(ni, j + o + 1), d = V(i, j + 1);
      tris.push(a, b, c, a, c, d);
    }
  }
  // 找邊界半邊，用軸心點扇形封口
  const key = (a: number, b: number) => a * 4294967296 + b;
  const half = new Set<number>();
  for (let f = 0; f < tris.length; f += 3) for (let e = 0; e < 3; e++) half.add(key(tris[f + e], tris[f + ((e + 1) % 3)]));
  const zMid = (z0 + z1) / 2;
  const bottom = N * S, topC = N * S + 1;
  let zLo = Infinity, zHi = -Infinity;
  const caps: number[] = [];
  for (let f = 0; f < tris.length; f += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[f + e], b = tris[f + ((e + 1) % 3)];
      if (half.has(key(b, a))) continue;
      const za = verts[a * 3 + 2], zb = verts[b * 3 + 2];
      const lowSide = (za + zb) / 2 < zMid;
      if (lowSide) zLo = Math.min(zLo, za, zb);
      else zHi = Math.max(zHi, za, zb);
      caps.push(b, a, lowSide ? bottom : topC);
    }
  }
  verts.set([0, 0, zLo], bottom * 3);
  verts.set([0, 0, zHi], topC * 3);
  const all = new Uint32Array(tris.length + caps.length);
  all.set(tris);
  all.set(caps, tris.length);
  const mesh = new Mesh({ numProp: 3, vertProperties: verts, triVerts: all });
  return Manifold.ofMesh(mesh);
}

/** 由 (r, z) 點組成的旋轉體（多邊形繞 Z 軸）。 */
export function revolveRZ(pts: [number, number][], segments: number): Manifold {
  const { CrossSection } = K();
  return CrossSection.ofPolygons([pts.map(([r, z]) => [Math.max(0, r), z] as [number, number])]).revolve(segments);
}

/**
 * 外螺紋段：z0..z1，兩端可倒角（45°，從小徑略內縮處開始），回傳實心螺桿。
 */
export function externalThread(t: ThreadSpec, z0: number, z1: number, segments: number, chamferLow: boolean, chamferHigh: boolean): Manifold {
  const raw = threadSolid(t, z0, z1, segments);
  const rMaj = t.d / 2;
  const rc = Math.max(0.3, rMaj - threadDepth(t) - 0.1 * t.pitch);
  const reach = Math.min(rMaj + 0.5 - rc, (z1 - z0) / 2.2);
  const R = rc + reach;
  const pts: [number, number][] = [[0, z0]];
  if (chamferLow) pts.push([rc, z0], [R, z0 + reach]);
  else pts.push([R, z0]);
  if (chamferHigh) pts.push([R, z1 - reach], [rc, z1]);
  else pts.push([R, z1]);
  pts.push([0, z1]);
  return raw.intersect(revolveRZ(pts, segments));
}

/** 母螺紋切刀：沿 z0..z1 貫穿，可加入口倒角；從實體減掉它就得到內螺紋。 */
export function internalCutter(t: ThreadSpec, z0: number, z1: number, segments: number, clearance: number, chamferLow: boolean, chamferHigh: boolean): Manifold {
  const cut = threadSolid(t, z0 - t.pitch, z1 + t.pitch, segments, clearance);
  const rA = t.d / 2 + clearance + 0.2;
  const rMin = t.d / 2 + clearance - threadDepth(t);
  const dz = rA - rMin;
  const parts = [cut];
  if (chamferLow) parts.push(revolveRZ([[0, z0 - 1], [rA + 1, z0 - 1], [rMin, z0 + dz], [0, z0 + dz]], segments));
  if (chamferHigh) parts.push(revolveRZ([[0, z1 - dz], [rMin, z1 - dz], [rA + 1, z1 + 1], [0, z1 + 1]], segments));
  return parts.length === 1 ? cut : K().Manifold.union(parts);
}
