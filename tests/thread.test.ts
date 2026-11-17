import { beforeAll, describe, expect, it } from 'vitest';
import { cleanup, initKernel, K } from '../src/geom/kernel';
import { externalThread, internalCutter, threadDepth, type ThreadSpec } from '../src/geom/thread';

const M8: ThreadSpec = { d: 8, pitch: 1.25, starts: 1, profile: 'metric', flankAngle: 30, depthFactor: 0.5, crestFlat: 0.5, fillet: 0.1 };

beforeAll(async () => {
  await initKernel();
});

describe('thread', () => {
  it('M8 外螺紋是有效實體且體積合理', () => {
    const t0 = Date.now();
    const s = externalThread(M8, 0, 20, 64, true, true);
    expect(s.status()).toBe('NoError');
    const v = s.volume();
    const rMin = 4 - threadDepth(M8);
    expect(v).toBeGreaterThan(Math.PI * rMin * rMin * 20);
    expect(v).toBeLessThan(Math.PI * 16 * 20);
    expect(s.genus()).toBe(0);
    console.log('M8x20', v.toFixed(1), s.numTri(), Date.now() - t0, 'ms');
    cleanup();
  });
  it('公母螺紋在螺距整數倍位置不干涉', () => {
    const bolt = externalThread(M8, 0, 20, 64, true, true);
    const nutBody = K().Manifold.cylinder(6.5, 7, 7, 64).translate([0, 0, 5]);
    const nut = nutBody.subtract(internalCutter(M8, 5, 11.5, 64, 0.2, true, true));
    expect(nut.status()).toBe('NoError');
    expect(nut.genus()).toBe(1);
    const overlap = bolt.intersect(nut).volume();
    console.log('overlap', overlap, 'nut', nut.volume().toFixed(1));
    expect(overlap).toBeLessThan(0.01);
    // 錯開半個螺距就會干涉
    const bad = bolt.intersect(nut.translate([0, 0, 0.625])).volume();
    expect(bad).toBeGreaterThan(1);
    cleanup();
  });
  it('梯形多線與圓牙', () => {
    for (const t of [
      { ...M8, profile: 'trapezoid' as const, pitch: 2, starts: 4, depthFactor: 0.5 },
      { ...M8, profile: 'round' as const, pitch: 2.5, depthFactor: 0.3 },
      { ...M8, profile: 'square' as const, pitch: 2 },
    ]) {
      const s = externalThread(t, 0, 15, 48, true, false);
      expect(s.status()).toBe('NoError');
      expect(s.volume()).toBeGreaterThan(100);
    }
    cleanup();
  });
});
