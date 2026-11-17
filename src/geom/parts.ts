// 各種零件的建模。座標慣例（組合圖）：螺絲軸線為 Z，頭部承面在 z = 0，
// 頭部在 z < 0，螺桿在 0..length。螺紋相位都以 z = 0 為準，所以螺帽放在
// 螺距整數倍的高度就能咬合。
import { K, segmentsFor, type CrossSection, type Manifold } from './kernel';
import type { Drive, Params } from './params';
import { externalThread, internalCutter, revolveRZ, threadDepth, type ThreadSpec } from './thread';

export interface Part {
  id: string;
  name: string;
  color: string;
  /** 組合圖座標 */
  assembly: Manifold;
  /** 列印時要不要倒過來（螺紋朝下） */
  flip: boolean;
}

export const spec = (p: Params): ThreadSpec => ({
  d: p.d,
  pitch: p.pitch,
  starts: p.starts,
  profile: p.profile,
  flankAngle: p.flankAngle,
  depthFactor: p.depthFactor,
  crestFlat: p.crestFlat,
  fillet: p.fillet,
});

const C = {
  bolt: '#d9a520',
  nut: '#3f8fe0',
  washer: '#9aa6b2',
  rod: '#e07a3f',
  insert: '#33b07a',
  standoff: '#8d63d6',
};

// --- 共用形狀 ---------------------------------------------------------------------

/** 正 N 邊形（對邊距離 af），一條邊與 X 軸平行。 */
function polygonSection(sides: number, af: number): CrossSection {
  const R = af / 2 / Math.cos(Math.PI / sides);
  return K().CrossSection.circle(R, sides).rotate(180 / sides + (sides % 2 ? 90 : 0));
}

function prism(cs: CrossSection, z0: number, z1: number): Manifold {
  return cs.extrude(z1 - z0).translate([0, 0, z0]);
}

/** 滾花：鋸齒狀外緣。 */
function knurlSection(D: number, segs: number): CrossSection {
  const R = D / 2;
  const n = Math.max(12, Math.round((Math.PI * D) / 2.2));
  const depth = Math.min(0.8, R * 0.08 + 0.3);
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n;
    const r = i % 2 ? R - depth : R;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  void segs;
  return K().CrossSection.ofPolygons([pts]);
}

/**
 * 30° 倒角用的旋轉體：在 zLo、zHi 兩面把外緣削成圓錐（從半徑 rFace 開始往外斜）。
 * 跟稜柱取交集就是常見的六角頭倒角。
 */
function chamferClip(rFace: number, zLo: number, zHi: number, lo: boolean, hi: boolean, segs: number): Manifold {
  const R = rFace * 1.6 + 2;
  const t = Math.tan((30 * Math.PI) / 180);
  const pts: [number, number][] = [[0, zLo]];
  if (lo) pts.push([rFace, zLo], [R, zLo + (R - rFace) * t]);
  else pts.push([R, zLo]);
  if (hi) pts.push([R, zHi - (R - rFace) * t], [rFace, zHi]);
  else pts.push([R, zHi]);
  pts.push([0, zHi]);
  // 兩個斜面在中間交叉時（很薄的零件），改用較小的外半徑
  if (lo && hi && zLo + (R - rFace) * t > zHi - (R - rFace) * t) {
    const mid = (zLo + zHi) / 2;
    const Rm = rFace + (mid - zLo) / t;
    return revolveRZ([[0, zLo], [rFace, zLo], [Rm, mid], [rFace, zHi], [0, zHi]], segs);
  }
  return revolveRZ(pts, segs);
}

/** 起子槽／工具孔，開口在 z = face，往 +Z（dir = 1）或 -Z 方向挖進 depth。 */
function driveCutter(drive: Drive, size: number, headSize: number, face: number, depth: number, dir: 1 | -1, segs: number): Manifold | null {
  const { Manifold, CrossSection } = K();
  if (drive === 'none' || depth <= 0) return null;
  const z0 = dir > 0 ? face - 1 : face - depth;
  const z1 = dir > 0 ? face + depth : face + 1;
  let m: Manifold;
  if (drive === 'slot') {
    const w = Math.max(0.8, size);
    m = Manifold.cube([headSize + 4, w, z1 - z0], false).translate([-(headSize + 4) / 2, -w / 2, z0]);
  } else if (drive === 'hex') {
    m = prism(polygonSection(6, size), z0, z1);
    // 底部錐形，比較好印也比較像真的
    const tip = revolveRZ(dir > 0 ? [[0, z1], [size / 2, z1], [0, z1 + size * 0.29]] : [[0, z0 - size * 0.29], [size / 2, z0], [0, z0]], segs);
    m = m.add(tip);
  } else if (drive === 'torx') {
    const R = size / 2;
    let cs = CrossSection.circle(R * 0.74, segs);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      cs = cs.add(CrossSection.circle(R * 0.24, 24).translate([Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76]));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      cs = cs.subtract(CrossSection.circle(R * 0.23, 24).translate([Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98]));
    }
    m = prism(cs, z0, z1);
  } else {
    // 十字（Phillips）：兩條交叉的槽，越深越窄
    const L = Math.max(2, size);
    const w = Math.max(0.8, L * 0.2);
    const bar = (rot: number) => Manifold.cube([L, w, z1 - z0], false).translate([-L / 2, -w / 2, z0]).rotate([0, 0, rot]);
    m = bar(0).add(bar(90));
    const cone = dir > 0
      ? revolveRZ([[0, z0], [L, z0], [L / 2 + 0.01, face], [w * 0.4, face + depth], [0, face + depth]], segs)
      : revolveRZ([[0, face - depth], [w * 0.4, face - depth], [L / 2 + 0.01, face], [L, z1], [0, z1]], segs);
    m = m.intersect(cone);
  }
  return m;
}

// --- 螺絲 -------------------------------------------------------------------------

function boltHead(p: Params, segs: number): { head: Manifold; face: number; flip: boolean } {
  const { Manifold, CrossSection } = K();
  const hh = Math.max(0.6, p.headHeight);
  const S = p.headSize;
  const zLo = -hh, zHi = 0;
  const hs = segmentsFor(S, p.quality);
  switch (p.head) {
    case 'hex':
    case 'square':
    case 'ngon': {
      const sides = p.head === 'hex' ? 6 : p.head === 'square' ? 4 : Math.max(3, Math.min(12, Math.round(p.sides)));
      const body = prism(polygonSection(sides, S), zLo, zHi);
      return { head: body.intersect(chamferClip(S / 2 * 0.98, zLo, zHi, true, true, hs)), face: zLo, flip: false };
    }
    case 'flange': {
      const ft = Math.max(0.8, hh * 0.25);
      const D = S * 1.35;
      const body = prism(polygonSection(6, S), zLo, zHi - ft + 0.01).intersect(chamferClip(S / 2 * 0.98, zLo, zHi, true, false, hs));
      const fl = revolveRZ([[0, -ft], [D / 2 - ft * 0.6, -ft], [D / 2, -ft * 0.4], [D / 2, 0], [0, 0]], segmentsFor(D, p.quality));
      return { head: body.add(fl), face: zLo, flip: false };
    }
    case 'socket':
    case 'cheese': {
      const r = S / 2;
      const c = Math.min(0.6, hh * 0.15);
      return { head: revolveRZ([[0, zLo], [r - c, zLo], [r, zLo + c], [r, zHi], [0, zHi]], hs), face: zLo, flip: false };
    }
    case 'countersunk': {
      const r = S / 2;
      const edge = Math.min(0.5, hh * 0.15);
      return { head: revolveRZ([[0, zLo], [r, zLo], [r, zLo + edge], [p.d / 2, zHi], [0, zHi]], hs), face: zLo, flip: false };
    }
    case 'button': {
      const r = S / 2;
      const pts: [number, number][] = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * (Math.PI / 2);
        pts.push([r * Math.sin(a), zHi - hh * Math.cos(a)]);
      }
      pts[pts.length - 1] = [r, zHi - Math.min(0.4, hh * 0.1)];
      pts.push([r, zHi], [0, zHi]);
      return { head: revolveRZ(pts, hs), face: zLo, flip: true };
    }
    case 'knurled': {
      const body = prism(knurlSection(S, hs), zLo, zHi);
      return { head: body.intersect(chamferClip(S / 2 - 0.6, zLo, zHi, true, true, hs)), face: zLo, flip: false };
    }
    case 'none':
    default:
      void CrossSection;
      return { head: Manifold.cube([0.001, 0.001, 0.001]).translate([0, 0, -1000]), face: 0, flip: false };
  }
}

export function buildBolt(p: Params): Part {
  const { Manifold } = K();
  const t = spec(p);
  const segs = segmentsFor(p.d, p.quality);
  const L = Math.max(p.pitch * 2, p.length);
  const shank = Math.max(0, Math.min(p.shank, L - p.pitch * 2));
  const noHead = p.head === 'none';
  const { head, face, flip } = boltHead(p, segs);
  const parts: Manifold[] = [];
  if (!noHead) parts.push(head);
  // 螺紋從光桿末端（或頭部裡面一點）開始
  const tStart = shank > 0 ? shank : noHead ? 0 : -Math.min(0.5, p.headHeight * 0.5);
  parts.push(externalThread(t, tStart, L, segs, noHead && p.tipChamfer, p.tipChamfer));
  if (shank > 0) parts.push(Manifold.cylinder(shank + (noHead ? 0 : 0.5) + 0.01, p.d / 2, p.d / 2, segs).translate([0, 0, noHead ? 0 : -0.5]));
  let m = Manifold.union(parts);
  // 起子槽：有頭的在頭部外側面；無頭（止付螺絲）在 z = 0 那端
  const driveFace = noHead ? 0 : face;
  const depth = noHead
    ? Math.min(p.d * 0.6, L * 0.45)
    : p.head === 'countersunk' ? p.headHeight * 0.75
      : p.head === 'socket' ? p.headHeight * 0.6
        : p.head === 'button' ? p.headHeight * 0.6 : p.headHeight * 0.5;
  const dsize = p.drive === 'slot' ? Math.max(0.8, p.d * 0.16 + 0.4) : p.drive === 'phillips' ? Math.min(p.headSize * 0.7, p.driveSize * 1.6) : p.driveSize;
  const cut = driveCutter(p.drive, dsize, noHead ? p.d : p.headSize, driveFace, depth, 1, segs);
  if (cut) m = m.subtract(cut);
  if (p.hollow > 0) m = m.subtract(Manifold.cylinder(L + p.headHeight + 4, p.hollow / 2, p.hollow / 2, segmentsFor(p.hollow, p.quality)).translate([0, 0, -p.headHeight - 2]));
  return { id: 'bolt', name: '螺絲', color: C.bolt, assembly: m, flip };
}

// --- 螺帽 -------------------------------------------------------------------------

export function buildNut(p: Params, height = p.nutHeight): Part {
  const { Manifold, CrossSection } = K();
  const t = spec(p);
  const segs = segmentsFor(p.d, p.quality);
  const m = Math.max(p.pitch * 1.5, height);
  const S = Math.max(p.nutSize, p.d + 2 * p.clearance + 1.2);
  const hs = segmentsFor(S, p.quality);
  let body: Manifold;
  let blind = false;
  switch (p.nutType) {
    case 'square':
      body = prism(polygonSection(4, S), 0, m).intersect(chamferClip(S / 2 * 0.98, 0, m, true, true, hs));
      break;
    case 'ngon': {
      const sides = Math.max(3, Math.min(12, Math.round(p.sides)));
      body = prism(polygonSection(sides, S), 0, m).intersect(chamferClip(S / 2 * 0.98, 0, m, true, true, hs));
      break;
    }
    case 'flange': {
      const ft = Math.max(0.8, m * 0.22);
      const D = S * 1.4;
      body = prism(polygonSection(6, S), ft - 0.01, m).intersect(chamferClip(S / 2 * 0.98, 0, m, false, true, hs));
      body = body.add(revolveRZ([[0, 0], [D / 2, 0], [D / 2, ft * 0.5], [D / 2 - ft * 0.6, ft], [0, ft]], segmentsFor(D, p.quality)));
      break;
    }
    case 'cap': {
      blind = true;
      const hex = prism(polygonSection(6, S), 0, m).intersect(chamferClip(S / 2 * 0.98, 0, m, true, false, hs));
      const R = S / 2 * 0.92;
      const n = 20;
      const pts: [number, number][] = [[0, m - 0.01]];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * (Math.PI / 2);
        pts.push([R * Math.cos(a), m - 0.01 + R * Math.sin(a)]);
      }
      body = hex.add(revolveRZ(pts, hs));
      break;
    }
    case 'knurled':
      body = prism(knurlSection(S, hs), 0, m).intersect(chamferClip(S / 2 - 0.6, 0, m, true, true, hs));
      break;
    case 'wing': {
      const bossR = Math.max(p.d / 2 + p.clearance + 1.6, p.d * 0.95);
      body = Manifold.cylinder(m, bossR, bossR * 0.92, hs);
      const span = bossR + p.d * 1.2 + 2;
      const wingH = Math.max(m * 1.6 + 2, p.d * 2);
      const rW = Math.max(1.5, p.d * 0.35);
      const th = Math.max(1.6, p.d * 0.32);
      const prof = CrossSection.hull([
        CrossSection.square([bossR, m], false),
        CrossSection.circle(rW, 32).translate([span - rW, wingH - rW]),
        CrossSection.square([0.01, 0.6], false).translate([span - rW * 1.2, 0]),
      ]);
      // 剖面在 XZ 平面：先在 XY 擠出，再轉成直立
      const wing = prof.extrude(th).translate([0, 0, -th / 2]).rotate([90, 0, 0]);
      body = body.add(wing).add(wing.rotate([0, 0, 180]));
      break;
    }
    case 'hex':
    default:
      body = prism(polygonSection(6, S), 0, m).intersect(chamferClip(S / 2 * 0.98, 0, m, true, true, hs));
  }
  let cut = internalCutter(t, 0, m, segs, p.clearance, true, !blind);
  // 蓋形螺帽：螺紋只到六角部分頂端，圓頂保持封閉
  if (blind) cut = cut.intersect(Manifold.cylinder(m - 0.4 + 10, S, S, 16).translate([0, 0, -10]));
  body = body.subtract(cut);
  return { id: 'nut', name: '螺帽', color: C.nut, assembly: body, flip: false };
}

// --- 墊圈 -------------------------------------------------------------------------

export function buildWasher(p: Params): Part {
  const id = p.d + 2 * p.clearance + 0.4;
  const od = Math.max(id + 2, p.washerOD);
  const t = Math.max(0.4, p.washerT);
  const c = Math.min(0.3, t * 0.25);
  const ri = id / 2, ro = od / 2;
  const m = revolveRZ([[ri, 0], [ro - c, 0], [ro, c], [ro, t - c], [ro - c, t], [ri, t]], segmentsFor(od, p.quality));
  return { id: 'washer', name: '墊圈', color: C.washer, assembly: m, flip: false };
}

// --- 螺紋桿／雙頭螺絲 -------------------------------------------------------------

export function buildRod(p: Params): Part {
  const { Manifold } = K();
  const t = spec(p);
  const segs = segmentsFor(p.d, p.quality);
  const L = Math.max(p.pitch * 3, p.length);
  let m: Manifold;
  if (p.rodMid === 'none') m = externalThread(t, 0, L, segs, p.tipChamfer, p.tipChamfer);
  else {
    const ml = Math.max(1, Math.min(p.midLength, L - p.pitch * 2));
    const a = p.rodMidPos === 'end' ? L - ml : (L - ml) / 2;
    const b = a + ml;
    const mid = p.rodMid === 'hex'
      ? prism(polygonSection(6, Math.max(p.nutSize * 0.8, p.d + 1)), a, b).intersect(chamferClip(Math.max(p.nutSize * 0.8, p.d + 1) / 2 * 0.98, a, b, true, true, segmentsFor(p.nutSize, p.quality)))
      : Manifold.cylinder(ml, p.d / 2, p.d / 2, segs).translate([0, 0, a]);
    const parts = [mid, externalThread(t, 0, a + 0.3, segs, p.tipChamfer, false)];
    if (p.rodMidPos !== 'end') parts.push(externalThread(t, b - 0.3, L, segs, false, p.tipChamfer));
    m = Manifold.union(parts);
  }
  if (p.hollow > 0) m = m.subtract(Manifold.cylinder(L + 2, p.hollow / 2, p.hollow / 2, segmentsFor(p.hollow, p.quality)).translate([0, 0, -1]));
  return { id: 'rod', name: '螺紋桿', color: C.rod, assembly: m, flip: false };
}

// --- 螺紋嵌件 ---------------------------------------------------------------------

export function buildInsert(p: Params): Part {
  const { Manifold } = K();
  const t = spec(p);
  const segs = segmentsFor(p.d, p.quality);
  const L = Math.max(p.pitch * 2, p.length);
  const od = p.d + 2 * p.clearance + 2 * Math.max(0.8, p.wall);
  const hs = segmentsFor(od, p.quality);
  let body: Manifold;
  if (p.outer === 'hex') body = prism(polygonSection(6, od), 0, L).intersect(chamferClip(od / 2 * 0.98, 0, L, true, true, hs));
  else if (p.outer === 'knurled') body = prism(knurlSection(od + 1, hs), 0, L).intersect(chamferClip(od / 2 + 0.5 - 0.3, 0, L, true, true, hs));
  else body = revolveRZ([[0, 0], [od / 2 - 0.3, 0], [od / 2, 0.3], [od / 2, L - 0.3], [od / 2 - 0.3, L], [0, L]], hs);
  body = body.subtract(internalCutter(t, 0, L, segs, p.clearance, true, true));
  void Manifold;
  return { id: 'insert', name: '螺紋嵌件', color: C.insert, assembly: body, flip: false };
}

// --- 支柱（母－公） ---------------------------------------------------------------

export function buildStandoff(p: Params): Part {
  const { Manifold } = K();
  const t = spec(p);
  const segs = segmentsFor(p.d, p.quality);
  const L = Math.max(p.pitch * 2, p.length);
  const S = Math.max(p.nutSize, p.d + 2 * p.clearance + 2);
  const hs = segmentsFor(S, p.quality);
  let body = prism(polygonSection(6, S), 0, L).intersect(chamferClip(S / 2 * 0.98, 0, L, true, true, hs));
  const male = Math.max(0, p.standoffMale);
  if (male > 0) {
    const depth = Math.min(L - 1, Math.max(p.d * 1.5, L * 0.6));
    body = body.subtract(internalCutter(t, 0, depth, segs, p.clearance, true, false).intersect(Manifold.cylinder(depth + 10, S, S, 16).translate([0, 0, -10])));
    body = Manifold.union([body, externalThread(t, L - 0.3, L + male, segs, false, p.tipChamfer)]);
  } else body = body.subtract(internalCutter(t, 0, L, segs, p.clearance, true, true));
  return { id: 'standoff', name: '支柱', color: C.standoff, assembly: body, flip: false };
}

export { threadDepth };
