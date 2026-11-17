// 參數定義、預設值與規格表（ISO 公制粗牙／細牙、英制 UNC、梯形牙、列印大牙）。
import type { Quality } from './kernel';
import type { ProfileKind } from './thread';

export type Kind = 'bolt' | 'nut' | 'washer' | 'rod' | 'insert' | 'standoff' | 'kit';
export type HeadType = 'hex' | 'flange' | 'socket' | 'cheese' | 'countersunk' | 'button' | 'knurled' | 'square' | 'ngon' | 'none';
export type Drive = 'none' | 'slot' | 'hex' | 'phillips' | 'torx';
export type NutType = 'hex' | 'square' | 'flange' | 'cap' | 'knurled' | 'wing' | 'ngon';
export type RodMid = 'none' | 'hex' | 'smooth';
export type Outer = 'round' | 'hex' | 'knurled';

export interface Params {
  kind: Kind;
  preset: string;
  // 螺紋
  profile: ProfileKind;
  d: number;
  pitch: number;
  starts: number;
  leftHand: boolean;
  flankAngle: number;
  depthFactor: number;
  crestFlat: number;
  fillet: number;
  clearance: number;
  // 螺絲
  length: number;
  shank: number;
  head: HeadType;
  headSize: number;
  headHeight: number;
  sides: number;
  drive: Drive;
  driveSize: number;
  tipChamfer: boolean;
  hollow: number;
  // 螺帽
  nutType: NutType;
  nutSize: number;
  nutHeight: number;
  // 墊圈
  washerOD: number;
  washerT: number;
  kitWasher: boolean;
  // 螺紋桿
  rodMid: RodMid;
  rodMidPos: 'center' | 'end';
  midLength: number;
  // 嵌件／支柱
  outer: Outer;
  wall: number;
  standoffMale: number;
  // 品質
  quality: Quality;
}

export interface Preset {
  id: string;
  label: string;
  group: string;
  d: number;
  pitch: number;
  starts?: number;
  profile: ProfileKind;
  /** 六角對邊 */
  af: number;
  /** 六角頭高 */
  k: number;
  /** 螺帽高 */
  m: number;
  /** 內六角圓柱頭直徑 */
  dk: number;
  /** 內六角扳手尺寸 */
  s: number;
  depthFactor?: number;
  flankAngle?: number;
  crestFlat?: number;
  fillet?: number;
  note?: string;
}

const iso = (d: number, pitch: number, af: number, k: number, m: number, dk: number, s: number, group = '公制粗牙（ISO）'): Preset => ({
  id: `M${d}${group.includes('細牙') ? `x${pitch}` : ''}`,
  label: group.includes('細牙') ? `M${d}×${pitch}` : `M${d}（螺距 ${pitch}）`,
  group,
  d,
  pitch,
  profile: 'metric',
  af,
  k,
  m,
  dk,
  s,
});

export const PRESETS: Preset[] = [
  iso(3, 0.5, 5.5, 2, 2.4, 5.5, 2.5),
  iso(4, 0.7, 7, 2.8, 3.2, 7, 3),
  iso(5, 0.8, 8, 3.5, 4.7, 8.5, 4),
  iso(6, 1, 10, 4, 5.2, 10, 5),
  iso(8, 1.25, 13, 5.3, 6.8, 13, 6),
  iso(10, 1.5, 16, 6.4, 8.4, 16, 8),
  iso(12, 1.75, 18, 7.5, 10.8, 18, 10),
  iso(14, 2, 21, 8.8, 12.8, 21, 12),
  iso(16, 2, 24, 10, 14.8, 24, 14),
  iso(20, 2.5, 30, 12.5, 18, 30, 17),
  iso(24, 3, 36, 15, 21.5, 36, 19),
  iso(30, 3.5, 46, 18.7, 25.6, 45, 22),
  iso(8, 1, 13, 5.3, 6.8, 13, 6, '公制細牙（ISO）'),
  iso(10, 1.25, 16, 6.4, 8.4, 16, 8, '公制細牙（ISO）'),
  iso(12, 1.5, 18, 7.5, 10.8, 18, 10, '公制細牙（ISO）'),
  iso(16, 1.5, 24, 10, 14.8, 24, 14, '公制細牙（ISO）'),
  iso(20, 1.5, 30, 12.5, 18, 30, 17, '公制細牙（ISO）'),
  { id: 'UNC1/4', label: '1/4"-20 UNC（相機螺絲）', group: '英制（UNC）', d: 6.35, pitch: 1.27, profile: 'metric', af: 11.11, k: 4.37, m: 5.56, dk: 9.53, s: 4.76 },
  { id: 'UNC5/16', label: '5/16"-18 UNC', group: '英制（UNC）', d: 7.94, pitch: 1.411, profile: 'metric', af: 12.7, k: 5.56, m: 6.75, dk: 11.91, s: 6.35 },
  { id: 'UNC3/8', label: '3/8"-16 UNC（相機腳架）', group: '英制（UNC）', d: 9.525, pitch: 1.5875, profile: 'metric', af: 14.29, k: 6.35, m: 8.33, dk: 14.29, s: 7.94 },
  { id: 'UNC1/2', label: '1/2"-13 UNC', group: '英制（UNC）', d: 12.7, pitch: 1.954, profile: 'metric', af: 19.05, k: 8.33, m: 11.11, dk: 19.05, s: 9.53 },
  { id: 'Tr8x2', label: 'Tr8×2', group: '梯形牙（ISO 30°）', d: 8, pitch: 2, profile: 'trapezoid', af: 13, k: 5.3, m: 10, dk: 13, s: 6, depthFactor: 0.5, flankAngle: 30, crestFlat: 0.5 },
  { id: 'T8', label: 'T8 絲桿（Tr8×8，4 線）', group: '梯形牙（ISO 30°）', d: 8, pitch: 2, starts: 4, profile: 'trapezoid', af: 13, k: 5.3, m: 10, dk: 13, s: 6, depthFactor: 0.5, flankAngle: 30, crestFlat: 0.5, note: '3D 印表機 Z 軸常見的絲桿' },
  { id: 'Tr10x2', label: 'Tr10×2', group: '梯形牙（ISO 30°）', d: 10, pitch: 2, profile: 'trapezoid', af: 16, k: 6.4, m: 12, dk: 16, s: 8, depthFactor: 0.5, flankAngle: 30, crestFlat: 0.5 },
  { id: 'Tr12x3', label: 'Tr12×3', group: '梯形牙（ISO 30°）', d: 12, pitch: 3, profile: 'trapezoid', af: 18, k: 7.5, m: 14, dk: 18, s: 10, depthFactor: 0.5, flankAngle: 30, crestFlat: 0.5 },
  { id: 'Tr16x4', label: 'Tr16×4', group: '梯形牙（ISO 30°）', d: 16, pitch: 4, profile: 'trapezoid', af: 24, k: 10, m: 18, dk: 24, s: 14, depthFactor: 0.5, flankAngle: 30, crestFlat: 0.5 },
  { id: 'Tr20x4', label: 'Tr20×4', group: '梯形牙（ISO 30°）', d: 20, pitch: 4, profile: 'trapezoid', af: 30, k: 12.5, m: 22, dk: 30, s: 17, depthFactor: 0.5, flankAngle: 30, crestFlat: 0.5 },
  { id: 'P6', label: '列印大牙 6.25×2.5（ACME 類）', group: '列印友善大牙', d: 6.25, pitch: 2.5, profile: 'trapezoid', af: 25, k: 6.25, m: 6.25, dk: 12, s: 5, depthFactor: 0.25, flankAngle: 30, crestFlat: 0.5, fillet: 0.1, note: '平頂梯形牙，小尺寸也好印' },
  { id: 'P10', label: '列印大牙 10×3', group: '列印友善大牙', d: 10, pitch: 3, profile: 'trapezoid', af: 17, k: 7, m: 9, dk: 16, s: 8, depthFactor: 0.3, flankAngle: 40, crestFlat: 0.5, fillet: 0.15 },
  { id: 'P16', label: '列印大牙 16×4', group: '列印友善大牙', d: 16, pitch: 4, profile: 'trapezoid', af: 26, k: 10, m: 12, dk: 24, s: 12, depthFactor: 0.3, flankAngle: 40, crestFlat: 0.5, fillet: 0.2 },
  { id: 'P25', label: '列印大牙 25×5（旋鈕／蓋子）', group: '列印友善大牙', d: 25, pitch: 5, profile: 'trapezoid', af: 38, k: 12, m: 15, dk: 36, s: 17, depthFactor: 0.3, flankAngle: 40, crestFlat: 0.5, fillet: 0.3 },
  { id: 'R12', label: '圓牙 12×3（耐磨好轉）', group: '列印友善大牙', d: 12, pitch: 3, profile: 'round', af: 19, k: 7.5, m: 10, dk: 18, s: 10, depthFactor: 0.3 },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

export const DEFAULTS: Params = {
  kind: 'bolt',
  preset: 'M8',
  profile: 'metric',
  d: 8,
  pitch: 1.25,
  starts: 1,
  leftHand: false,
  flankAngle: 30,
  depthFactor: 0.5,
  crestFlat: 0.5,
  fillet: 0.05,
  clearance: 0.2,
  length: 30,
  shank: 0,
  head: 'hex',
  headSize: 13,
  headHeight: 5.3,
  sides: 8,
  drive: 'none',
  driveSize: 6,
  tipChamfer: true,
  hollow: 0,
  nutType: 'hex',
  nutSize: 13,
  nutHeight: 6.8,
  washerOD: 16,
  washerT: 1.6,
  kitWasher: true,
  rodMid: 'none',
  rodMidPos: 'center',
  midLength: 10,
  outer: 'knurled',
  wall: 2,
  standoffMale: 6,
  quality: 'normal',
};

/** 套用規格：只改跟規格有關的欄位。 */
export function applyPreset(p: Params, id: string): Params {
  const pr = presetById(id);
  if (!pr) return { ...p, preset: 'custom' };
  const next: Params = {
    ...p,
    preset: id,
    profile: pr.profile,
    d: pr.d,
    pitch: pr.pitch,
    starts: pr.starts ?? 1,
    depthFactor: pr.depthFactor ?? p.depthFactor,
    flankAngle: pr.flankAngle ?? 30,
    crestFlat: pr.crestFlat ?? 0.5,
    fillet: pr.fillet ?? (pr.profile === 'metric' ? 0.05 : 0.1),
    nutSize: pr.af,
    nutHeight: pr.m,
    washerOD: Math.round(pr.d * 2 + 0.5),
    washerT: Math.max(1, Math.round(pr.d * 0.2 * 10) / 10),
    wall: Math.max(1.6, Math.round(pr.d * 0.25 * 10) / 10),
  };
  return withHeadDefaults(next, pr);
}

/** 換頭型時，依規格帶入合適的頭部尺寸。 */
export function withHeadDefaults(p: Params, pr = presetById(p.preset)): Params {
  const d = p.d;
  const af = pr?.af ?? Math.round(d * 1.6 * 10) / 10;
  const k = pr?.k ?? Math.round(d * 0.65 * 10) / 10;
  const dk = pr?.dk ?? Math.round(d * 1.6 * 10) / 10;
  const s = pr?.s ?? Math.round(d * 0.75 * 10) / 10;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const q = { ...p };
  switch (p.head) {
    case 'hex':
    case 'square':
    case 'ngon':
      q.headSize = af;
      q.headHeight = k;
      break;
    case 'flange':
      q.headSize = af;
      q.headHeight = r1(k * 1.1);
      break;
    case 'socket':
      q.headSize = dk;
      q.headHeight = d;
      q.driveSize = s;
      break;
    case 'cheese':
      q.headSize = r1(d * 1.6);
      q.headHeight = r1(d * 0.6);
      q.driveSize = r1(d * 0.16 + 0.4);
      break;
    case 'countersunk':
      q.headSize = r1(d * 2);
      q.headHeight = r1(d * 0.55);
      q.driveSize = r1(s * 0.9);
      break;
    case 'button':
      q.headSize = r1(d * 1.75);
      q.headHeight = r1(d * 0.55);
      q.driveSize = r1(s * 0.8);
      break;
    case 'knurled':
      q.headSize = r1(d * 2.5);
      q.headHeight = r1(d * 0.9);
      break;
    case 'none':
      q.driveSize = r1(Math.min(s, d * 0.5));
      break;
  }
  if (p.head === 'socket' || p.head === 'button' || p.head === 'countersunk') q.drive = q.drive === 'none' ? 'hex' : q.drive;
  if (p.head === 'none' && q.drive === 'none') q.drive = 'hex';
  return q;
}

export const DRIVE_OK: Record<HeadType, Drive[]> = {
  hex: ['none', 'slot', 'hex', 'phillips', 'torx'],
  flange: ['none', 'slot', 'hex', 'phillips', 'torx'],
  socket: ['hex', 'torx', 'phillips', 'slot', 'none'],
  cheese: ['slot', 'phillips', 'hex', 'torx', 'none'],
  countersunk: ['hex', 'phillips', 'slot', 'torx', 'none'],
  button: ['hex', 'phillips', 'slot', 'torx', 'none'],
  knurled: ['none', 'slot', 'hex', 'phillips', 'torx'],
  square: ['none', 'slot', 'hex', 'phillips', 'torx'],
  ngon: ['none', 'slot', 'hex', 'phillips', 'torx'],
  none: ['hex', 'slot', 'torx', 'phillips'],
};

/** 檢查參數，回傳要提醒使用者的事項（不阻擋建模）。 */
export function warnings(p: Params): string[] {
  const w: string[] = [];
  if (p.d < 5 && p.profile === 'metric') w.push('M5 以下的公制細螺紋用 FDM 不容易印好，建議改用「列印友善大牙」或噴嘴 0.2 mm。');
  if (p.pitch < 0.8) w.push('螺距小於 0.8 mm：層高請設 0.12 mm 以下。');
  if (p.clearance < 0.1) w.push('間隙小於 0.1 mm，列印後很可能轉不動。');
  if (p.clearance > 0.45) w.push('間隙大於 0.45 mm，會很鬆、容易滑牙。');
  if (p.hollow > 0 && p.hollow > p.d - 2 * 0.5413 * p.pitch - 1.2) w.push('中空孔太大，螺紋壁會太薄。');
  return w;
}
