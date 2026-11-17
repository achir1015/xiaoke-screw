import { beforeAll, describe, expect, it } from 'vitest';
import { build, buildParts } from '../src/geom/build';
import { cleanup, initKernel } from '../src/geom/kernel';
import { applyPreset, DEFAULTS, PRESETS, withHeadDefaults, type HeadType, type NutType, type Params, type Drive } from '../src/geom/params';

beforeAll(async () => {
  await initKernel();
});

const P = (o: Partial<Params>): Params => ({ ...DEFAULTS, quality: 'draft', ...o });

function ok(p: Params) {
  for (const { part } of buildParts(p)) {
    expect(part.assembly.status(), `${p.kind} ${part.id}`).toBe('NoError');
    expect(part.assembly.volume(), `${p.kind} ${part.id} 體積`).toBeGreaterThan(1);
  }
  cleanup();
}

describe('零件', () => {
  it('所有頭型 × 起子槽', () => {
    const heads: HeadType[] = ['hex', 'flange', 'socket', 'cheese', 'countersunk', 'button', 'knurled', 'square', 'ngon', 'none'];
    const drives: Drive[] = ['none', 'slot', 'hex', 'phillips', 'torx'];
    for (const head of heads)
      for (const drive of drives) {
        if (head === 'none' && drive === 'none') continue;
        ok({ ...withHeadDefaults(P({ head })), drive });
      }
  });
  it('所有螺帽', () => {
    const nuts: NutType[] = ['hex', 'square', 'flange', 'cap', 'knurled', 'wing', 'ngon'];
    for (const nutType of nuts) ok(P({ kind: 'nut', nutType }));
  });
  it('墊圈、螺紋桿、嵌件、支柱', () => {
    ok(P({ kind: 'washer' }));
    for (const rodMid of ['none', 'hex', 'smooth'] as const) for (const rodMidPos of ['center', 'end'] as const) ok(P({ kind: 'rod', rodMid, rodMidPos, length: 50 }));
    for (const outer of ['round', 'hex', 'knurled'] as const) ok(P({ kind: 'insert', outer, length: 10 }));
    ok(P({ kind: 'standoff', length: 20, standoffMale: 6 }));
    ok(P({ kind: 'standoff', length: 20, standoffMale: 0 }));
    ok(P({ kind: 'bolt', hollow: 2, shank: 10 }));
  });
  it('所有規格都能建', () => {
    for (const pr of PRESETS) {
      const p = applyPreset(P({ kind: 'kit', length: 25 }), pr.id);
      ok(p);
    }
  });
});

describe('配合', () => {
  for (const [label, o] of [
    ['M8 六角', {}],
    ['左旋 M10', { preset: 'M10', d: 10, pitch: 1.5, leftHand: true }],
    ['T8 四線', applyPreset(P({}), 'T8')],
    ['列印大牙', applyPreset(P({}), 'P6')],
    ['圓牙', applyPreset(P({}), 'R12')],
  ] as const) {
    it(`${label}：組合圖中螺絲、墊圈、螺帽不干涉`, async () => {
      const p = P({ ...o, kind: 'kit', length: 30, quality: 'normal' });
      const r = build(p);
      expect(r.parts.length).toBe(3);
      // 用網格重建 Manifold 再求交集
      const { K } = await import('../src/geom/kernel');
      const { Manifold, Mesh } = K();
      const ms = r.parts.map((x) => Manifold.ofMesh(new Mesh({ numProp: 3, vertProperties: x.assembly.positions, triVerts: x.assembly.indices })));
      const bolt = ms[0], washer = ms[1], nut = ms[2];
      expect(bolt.intersect(nut).volume()).toBeLessThan(0.05);
      expect(bolt.intersect(washer).volume()).toBeLessThan(0.05);
      expect(washer.intersect(nut).volume()).toBeLessThan(0.05);
      // 列印排版：每個零件底面在 z = 0
      for (const x of r.parts) {
        let min = Infinity;
        for (let i = 2; i < x.print.positions.length; i += 3) min = Math.min(min, x.print.positions[i]);
        expect(Math.abs(min)).toBeLessThan(1e-3);
      }
      cleanup();
    });
  }
});
