// 依參數建出所有零件，並產生「組合圖」與「列印排版」兩種擺法的網格。
import { cleanup, K, type Manifold } from './kernel';
import type { Params } from './params';
import { buildBolt, buildInsert, buildNut, buildRod, buildStandoff, buildWasher, type Part } from './parts';

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface BuiltPart {
  id: string;
  name: string;
  color: string;
  assembly: MeshData;
  print: MeshData;
  /** 列印擺放的外框尺寸（mm） */
  size: [number, number, number];
  volume: number;
  triangles: number;
}

export interface BuildResult {
  parts: BuiltPart[];
  ms: number;
}

function meshOf(m: Manifold): MeshData {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const n = mesh.vertProperties.length / np;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

/** 螺帽在螺絲上的位置：螺距整數倍，盡量靠近墊圈上方又不超出螺紋。 */
function nutSeat(p: Params, under: number, nutH: number): number {
  const P = p.pitch;
  const L = Math.max(p.pitch * 2, p.length);
  const want = Math.max(under, p.head === 'none' ? 0 : p.shank) + 0.6 * P;
  let g = Math.ceil(want / P) * P;
  if (g + nutH > L) g = Math.max(0, Math.floor((L - nutH) / P) * P);
  return g;
}

export function buildParts(p: Params): { part: Part; at: number }[] {
  switch (p.kind) {
    case 'bolt':
      return [{ part: buildBolt(p), at: 0 }];
    case 'nut':
      return [{ part: buildNut(p), at: 0 }];
    case 'washer':
      return [{ part: buildWasher(p), at: 0 }];
    case 'rod':
      return [{ part: buildRod(p), at: 0 }];
    case 'insert':
      return [{ part: buildInsert(p), at: 0 }];
    case 'standoff':
      return [{ part: buildStandoff(p), at: 0 }];
    case 'kit': {
      const out: { part: Part; at: number }[] = [{ part: buildBolt(p), at: 0 }];
      let under = 0;
      if (p.kitWasher) {
        out.push({ part: buildWasher(p), at: 0 });
        under = Math.max(0.4, p.washerT);
      }
      const nutH = Math.max(p.pitch * 1.5, p.nutHeight);
      out.push({ part: buildNut(p), at: nutSeat(p, under, nutH) });
      return out;
    }
  }
}

export function build(p: Params): BuildResult {
  const t0 = performance.now();
  try {
    const list = buildParts(p);
    const built: BuiltPart[] = [];
    let cursor = 0;
    const gap = 6;
    const placed: { m: Manifold; w: number }[] = [];
    for (const { part, at } of list) {
      let m = part.assembly;
      if (p.leftHand) m = m.mirror([1, 0, 0]);
      const asm = m.translate([0, 0, at]);
      // 列印擺放：需要時倒過來，底面貼平台，XY 置中
      let pr = part.flip ? m.rotate([180, 0, 0]) : m;
      const bb = pr.boundingBox();
      pr = pr.translate([-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]);
      const w = bb.max[0] - bb.min[0];
      placed.push({ m: pr, w });
      built.push({
        id: part.id,
        name: part.name,
        color: part.color,
        assembly: meshOf(asm),
        print: { positions: new Float32Array(), indices: new Uint32Array() },
        size: [w, bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
        volume: m.volume(),
        triangles: m.numTri(),
      });
    }
    // 一列排開，整體置中在原點
    const total = placed.reduce((s, x) => s + x.w, 0) + gap * (placed.length - 1);
    cursor = -total / 2;
    placed.forEach((x, i) => {
      built[i].print = meshOf(x.m.translate([cursor + x.w / 2, 0, 0]));
      cursor += x.w + gap;
    });
    void K;
    return { parts: built, ms: performance.now() - t0 };
  } finally {
    cleanup();
  }
}
