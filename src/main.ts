// 小柯機器人螺絲3D產生器：畫面、參數表單、建模排程、匯出。
import './style.css';
import { to3mf, toStl } from './export';
import type { BuildResult, BuiltPart } from './geom/build';
import { applyPreset, DEFAULTS, DRIVE_OK, PRESETS, presetById, warnings, withHeadDefaults, type Kind, type Params } from './geom/params';
import { threadDepth } from './geom/thread';
import { Viewer, type Mode } from './viewer';
import { checkUpdate, desktop, guideOnFirstRun, iosApp, androidApp, mobileApp, saveFile, startGuide } from './xiaoke';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;
const STORE = 'xiaoke-screw';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

// --- 狀態 -------------------------------------------------------------------------

function load(): Params {
  const hash = /[#&]p=([^&]+)/.exec(location.hash);
  if (hash) {
    try {
      return { ...DEFAULTS, ...JSON.parse(decodeURIComponent(escape(atob(hash[1])))) };
    } catch {
      // 連結壞了就用預設
    }
  }
  try {
    const s = localStorage.getItem(`${STORE}:params`);
    if (s) return { ...DEFAULTS, ...JSON.parse(s) };
  } catch {
    // 無痕模式
  }
  return { ...DEFAULTS };
}

let params: Params = load();
let result: BuildResult | null = null;

function save() {
  try {
    localStorage.setItem(`${STORE}:params`, JSON.stringify(params));
  } catch {
    // 忽略
  }
}

// --- 零件種類 ---------------------------------------------------------------------

const KINDS: { id: Kind; label: string; desc: string; svg: string }[] = [
  { id: 'bolt', label: '螺絲', desc: '六角、內六角、沉頭、圓頭、滾花…', svg: '<path d="M7 3h10l2 3-2 3H7L5 6z"/><path d="M9 9v12h6V9"/><path d="M9 12l6 1.5M9 15l6 1.5M9 18l6 1.5"/>' },
  { id: 'nut', label: '螺帽', desc: '六角、法蘭、蓋形、蝶形、滾花', svg: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3.6"/>' },
  { id: 'kit', label: '螺絲＋螺帽', desc: '一次做一整組，含墊圈', svg: '<path d="M6 3h8l1.5 2.5L14 8H6L4.5 5.5z"/><path d="M7.5 8v13h5V8"/><path d="M14 13.5l5 0 1.5 2.5-1.5 2.5h-5"/><path d="M5 14h10"/>' },
  { id: 'washer', label: '墊圈', desc: '平墊圈', svg: '<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="3.5" ry="2"/><path d="M3 12v2c0 2.8 4 5 9 5s9-2.2 9-5v-2"/>' },
  { id: 'rod', label: '螺紋桿', desc: '全牙、雙頭、單邊牙', svg: '<path d="M9 2v20h6V2z"/><path d="M9 5l6 1.5M9 8l6 1.5M9 15l6 1.5M9 18l6 1.5"/><path d="M8 11h8v2H8z"/>' },
  { id: 'insert', label: '螺紋嵌件', desc: '壓入或黏進零件的母牙', svg: '<rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M10 4v16M14 4v16M10 7l4 1.5M10 11l4 1.5M10 15l4 1.5"/>' },
  { id: 'standoff', label: '支柱', desc: '母－公、母－母銅柱', svg: '<path d="M8 8h8v13H8z"/><path d="M10 2v6h4V2"/><path d="M10 3.5l4 1M10 5.5l4 1"/><path d="M12 8v13"/>' },
];

function renderKinds() {
  const box = $('#kinds');
  box.innerHTML = KINDS.map((k) => `<button type="button" role="radio" data-kind="${k.id}" aria-checked="${params.kind === k.id}" title="${k.desc}"><svg viewBox="0 0 24 24">${k.svg}</svg><strong>${k.label}</strong></button>`).join('');
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind as Kind)));
}

function setKind(kind: Kind) {
  if (params.kind === kind) return;
  params = { ...params, kind };
  // 不同零件適合的長度不同
  if (kind === 'insert') params.length = Math.round(Math.max(params.d * 1.2, params.pitch * 3));
  else if (kind === 'standoff') params.length = Math.round(Math.max(params.d * 2.5, 10));
  else if (kind === 'rod') params.length = Math.max(params.length, Math.round(params.d * 6));
  else if (kind === 'bolt' || kind === 'kit') params.length = Math.max(Math.round(params.d * 2.5), Math.min(params.length, params.d * 8));
  renderKinds();
  renderForm();
  schedule(true);
}

// --- 規格 -------------------------------------------------------------------------

function renderPresets() {
  const sel = $<HTMLSelectElement>('#preset');
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  sel.innerHTML = groups.map((g) => `<optgroup label="${g}">${PRESETS.filter((p) => p.group === g).map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</optgroup>`).join('') + '<option value="custom">自訂（手動輸入）</option>';
  sel.value = params.preset;
  sel.addEventListener('change', () => setPreset(sel.value));
  updatePresetNote();
}

function setPreset(id: string) {
  params = id === 'custom' ? { ...params, preset: 'custom' } : applyPreset(params, id);
  $<HTMLSelectElement>('#preset').value = params.preset;
  updatePresetNote();
  renderForm();
  schedule(true);
}

function updatePresetNote() {
  const pr = presetById(params.preset);
  $('#preset-note').textContent = pr?.note ?? (params.preset === 'custom' ? '直接在下面輸入外徑與螺距。' : '');
}

// --- 參數表單 ---------------------------------------------------------------------

type P = Params;
interface Field {
  key: keyof Params;
  label: string | ((p: P) => string);
  type: 'number' | 'select' | 'check';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: [string, string][] | ((p: P) => [string, string][]);
  show?: (p: P) => boolean;
  hint?: string | ((p: P) => string);
  /** 改這個欄位會讓規格變成「自訂」 */
  custom?: boolean;
}
interface Group {
  id: string;
  title: string;
  show: (p: P) => boolean;
  open?: boolean;
  fields: Field[];
}

const has = (...k: Kind[]) => (p: P) => k.includes(p.kind);
const internal = has('nut', 'kit', 'insert', 'standoff', 'washer');
const bolty = has('bolt', 'kit');

const HEADS: [string, string][] = [
  ['hex', '六角頭'],
  ['flange', '六角法蘭頭'],
  ['socket', '內六角圓柱頭'],
  ['cheese', '圓柱頭（起子）'],
  ['countersunk', '沉頭（平頭）'],
  ['button', '圓頭（半圓）'],
  ['knurled', '滾花手轉頭'],
  ['square', '四角頭'],
  ['ngon', '多邊形頭'],
  ['none', '無頭（止付／全牙）'],
];
const DRIVES: Record<string, string> = { none: '無', slot: '一字槽', hex: '內六角', phillips: '十字', torx: '梅花（六角星）' };

const GROUPS: Group[] = [
  {
    id: 'size',
    title: '長度與尺寸',
    show: () => true,
    open: true,
    fields: [
      { key: 'length', label: (p) => (p.kind === 'insert' ? '嵌件長度' : p.kind === 'standoff' ? '六角柱長度' : p.kind === 'rod' ? '全長' : '螺桿長度（頭部以下）'), type: 'number', min: 2, max: 400, step: 1, unit: 'mm', show: has('bolt', 'kit', 'rod', 'insert', 'standoff') },
      { key: 'shank', label: '光桿長度（頭部下方無牙）', type: 'number', min: 0, max: 300, step: 1, unit: 'mm', show: (p) => bolty(p) && p.head !== 'none' },
      { key: 'tipChamfer', label: '末端倒角（比較好鎖入）', type: 'check', show: has('bolt', 'kit', 'rod', 'standoff') },
      { key: 'hollow', label: '中空孔直徑（0 = 實心）', type: 'number', min: 0, max: 40, step: 0.5, unit: 'mm', show: has('bolt', 'kit', 'rod'), hint: '可以穿線或當氣管用' },
      { key: 'rodMid', label: '中段', type: 'select', options: [['none', '全牙'], ['hex', '六角（好施力）'], ['smooth', '光桿']], show: has('rod') },
      { key: 'rodMidPos', label: '中段位置', type: 'select', options: [['center', '中間（雙頭螺絲）'], ['end', '一端（單邊牙）']], show: (p) => p.kind === 'rod' && p.rodMid !== 'none' },
      { key: 'midLength', label: '中段長度', type: 'number', min: 1, max: 200, step: 1, unit: 'mm', show: (p) => p.kind === 'rod' && p.rodMid !== 'none' },
      { key: 'outer', label: '外形', type: 'select', options: [['knurled', '滾花（壓入咬得緊）'], ['round', '圓柱'], ['hex', '六角（不會轉動）']], show: has('insert') },
      { key: 'wall', label: '壁厚', type: 'number', min: 0.8, max: 20, step: 0.2, unit: 'mm', show: has('insert') },
      { key: 'nutSize', label: (p) => (p.kind === 'rod' ? '六角對邊（中段 × 0.8）' : '六角對邊'), type: 'number', min: 3, max: 120, step: 0.5, unit: 'mm', show: (p) => p.kind === 'standoff' || (p.kind === 'rod' && p.rodMid === 'hex') },
      { key: 'standoffMale', label: '公牙長度（0 = 母－母）', type: 'number', min: 0, max: 100, step: 1, unit: 'mm', show: has('standoff') },
    ],
  },
  {
    id: 'head',
    title: '螺絲頭',
    show: bolty,
    open: true,
    fields: [
      { key: 'head', label: '頭型', type: 'select', options: HEADS },
      { key: 'sides', label: '邊數', type: 'number', min: 3, max: 12, step: 1, show: (p) => p.head === 'ngon' || (p.kind === 'nut' && p.nutType === 'ngon') },
      { key: 'headSize', label: (p) => (['hex', 'flange', 'square', 'ngon'].includes(p.head) ? '頭部對邊' : '頭部直徑'), type: 'number', min: 2, max: 150, step: 0.5, unit: 'mm', show: (p) => p.head !== 'none' },
      { key: 'headHeight', label: '頭部高度', type: 'number', min: 0.6, max: 80, step: 0.1, unit: 'mm', show: (p) => p.head !== 'none' },
      { key: 'drive', label: '起子槽', type: 'select', options: (p) => DRIVE_OK[p.head].map((d) => [d, DRIVES[d]] as [string, string]) },
      { key: 'driveSize', label: (p) => (p.drive === 'hex' ? '六角扳手尺寸' : p.drive === 'torx' ? '梅花外徑' : '起子大小'), type: 'number', min: 0.8, max: 60, step: 0.1, unit: 'mm', show: (p) => ['hex', 'torx', 'phillips'].includes(p.drive) },
    ],
  },
  {
    id: 'nut',
    title: '螺帽',
    show: has('nut', 'kit'),
    open: true,
    fields: [
      { key: 'nutType', label: '螺帽樣式', type: 'select', options: [['hex', '六角螺帽'], ['flange', '法蘭螺帽'], ['cap', '蓋形螺帽'], ['wing', '蝶形螺帽（手轉）'], ['knurled', '滾花螺帽（手轉）'], ['square', '四角螺帽'], ['ngon', '多邊形螺帽']] },
      { key: 'sides', label: '邊數', type: 'number', min: 3, max: 12, step: 1, show: (p) => p.nutType === 'ngon' && p.head !== 'ngon' },
      { key: 'nutSize', label: (p) => (p.nutType === 'knurled' ? '外徑' : p.nutType === 'wing' ? '（蝶形不用）' : '對邊'), type: 'number', min: 3, max: 150, step: 0.5, unit: 'mm', show: (p) => p.nutType !== 'wing' },
      { key: 'nutHeight', label: '高度', type: 'number', min: 1, max: 80, step: 0.1, unit: 'mm' },
    ],
  },
  {
    id: 'washer',
    title: '墊圈',
    show: has('washer', 'kit'),
    fields: [
      { key: 'kitWasher', label: '加一片墊圈', type: 'check', show: has('kit') },
      { key: 'washerOD', label: '外徑', type: 'number', min: 3, max: 200, step: 0.5, unit: 'mm', show: (p) => p.kind === 'washer' || p.kitWasher },
      { key: 'washerT', label: '厚度', type: 'number', min: 0.4, max: 20, step: 0.1, unit: 'mm', show: (p) => p.kind === 'washer' || p.kitWasher },
    ],
  },
  {
    id: 'thread',
    title: '螺紋',
    show: (p) => p.kind !== 'washer',
    open: true,
    fields: [
      { key: 'profile', label: '牙型', type: 'select', options: [['metric', '三角牙（公制／英制 60°）'], ['trapezoid', '梯形牙（ACME 類，好印）'], ['square', '方牙'], ['round', '圓牙（耐磨）']], custom: true },
      { key: 'd', label: '外徑（大徑）', type: 'number', min: 2, max: 200, step: 0.05, unit: 'mm', custom: true },
      { key: 'pitch', label: '螺距', type: 'number', min: 0.25, max: 20, step: 0.05, unit: 'mm', custom: true },
      { key: 'starts', label: '線數（導程 = 線數 × 螺距）', type: 'number', min: 1, max: 8, step: 1, custom: true },
      { key: 'leftHand', label: '左旋（反牙）', type: 'check' },
      { key: 'flankAngle', label: '牙型角（兩側面夾角）', type: 'number', min: 0, max: 100, step: 1, unit: '°', show: (p) => p.profile === 'trapezoid', custom: true, hint: '標準 ACME 是 29°、公制梯形 30°；角度大側壁斜、比較好印' },
      { key: 'depthFactor', label: '牙高（× 螺距）', type: 'number', min: 0.1, max: 0.7, step: 0.01, show: (p) => p.profile === 'trapezoid' || p.profile === 'round', custom: true, hint: '0.25 是矮牙（stub），比較耐用' },
      { key: 'crestFlat', label: '牙頂平台比例', type: 'number', min: 0, max: 1, step: 0.05, show: (p) => p.profile === 'trapezoid', custom: true },
      { key: 'fillet', label: '牙型圓角', type: 'number', min: 0, max: 2, step: 0.05, unit: 'mm', show: (p) => p.profile !== 'round', custom: true, hint: '小圓角可以分散應力、減少裂開' },
      { key: 'clearance', label: '配合間隙（半徑）', type: 'number', min: 0, max: 1, step: 0.05, unit: 'mm', show: internal, hint: 'FDM 建議 0.15～0.3；太緊就加大' },
    ],
  },
  {
    id: 'quality',
    title: '品質',
    show: () => true,
    fields: [{ key: 'quality', label: '網格精細度', type: 'select', options: [['draft', '草稿（最快）'], ['normal', '標準'], ['fine', '精細（檔案較大）']] }],
  },
];

const openState: Record<string, boolean> = {};

function renderForm() {
  const form = $<HTMLFormElement>('#params');
  const scroll = $('#scroll').scrollTop;
  form.innerHTML = '';
  for (const g of GROUPS) {
    if (!g.show(params)) continue;
    const det = document.createElement('details');
    det.className = 'group';
    det.dataset.group = g.id;
    det.open = openState[g.id] ?? !!g.open;
    det.addEventListener('toggle', () => (openState[g.id] = det.open));
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const f of g.fields) {
      if (f.show && !f.show(params)) continue;
      const row = document.createElement('label');
      row.className = `field ${f.type}`;
      row.dataset.key = f.key;
      const label = typeof f.label === 'function' ? f.label(params) : f.label;
      const v = params[f.key];
      const hint = typeof f.hint === 'function' ? f.hint(params) : f.hint;
      if (f.type === 'check') {
        row.innerHTML = `<input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}/><span>${label}</span>`;
      } else if (f.type === 'select') {
        const opts = typeof f.options === 'function' ? f.options(params) : f.options ?? [];
        row.innerHTML = `<span>${label}</span><select name="${f.key}">${opts.map(([val, t]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      } else {
        row.innerHTML = `<span>${label}</span><span class="num"><input type="number" name="${f.key}" value="${v}" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 'any'}" inputmode="decimal"/>${f.unit ? `<em>${f.unit}</em>` : ''}</span>`;
      }
      if (hint) row.insertAdjacentHTML('beforeend', `<small>${hint}</small>`);
      det.append(row);
    }
    form.append(det);
  }
  $('#scroll').scrollTop = scroll;
}

function fieldOf(key: string): Field | undefined {
  for (const g of GROUPS) for (const f of g.fields) if (f.key === key) return f;
  return undefined;
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const key = el.name as keyof Params;
  if (!key) return;
  const f = fieldOf(key);
  let val: unknown;
  if (el instanceof HTMLInputElement && el.type === 'checkbox') val = el.checked;
  else if (el instanceof HTMLInputElement && el.type === 'number') {
    const n = parseFloat(el.value);
    if (!Number.isFinite(n)) return;
    val = Math.max(f?.min ?? -Infinity, Math.min(f?.max ?? Infinity, n));
  } else val = el.value;
  setParams({ [key]: val } as Partial<Params>, e.type === 'change');
}

/** 改參數（教學示範也走這裡）。 */
function setParams(values: Partial<Params>, rerender = true) {
  let next = { ...params, ...values };
  if (Object.keys(values).some((k) => fieldOf(k)?.custom) && next.preset !== 'custom') {
    const pr = presetById(next.preset);
    const same = pr && pr.d === next.d && pr.pitch === next.pitch && pr.profile === next.profile && (pr.starts ?? 1) === next.starts;
    if (!same) next.preset = 'custom';
  }
  if ('head' in values) {
    next = withHeadDefaults(next);
    if (!DRIVE_OK[next.head].includes(next.drive)) next.drive = DRIVE_OK[next.head][0];
  }
  if ('starts' in values) next.starts = Math.max(1, Math.round(next.starts));
  params = next;
  $<HTMLSelectElement>('#preset').value = params.preset;
  updatePresetNote();
  // 結構會變的欄位才重畫表單（數字輸入中不重畫，避免游標跳掉）
  const structural = ['head', 'drive', 'nutType', 'profile', 'rodMid', 'kitWasher', 'kind'].some((k) => k in values);
  if (rerender && (structural || Object.keys(values).length > 1 || !document.activeElement?.closest('#params'))) renderForm();
  schedule(false);
}

// --- 建模排程 ---------------------------------------------------------------------

const viewer = new Viewer($('#viewer'));
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let seq = 0;
let busy = false;
let pending = false;
let refocus = false;
let timer = 0;
const waiters: (() => void)[] = [];

worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: BuildResult; error?: string }>) => {
  busy = false;
  const m = e.data;
  if (m.id === seq) {
    if (m.ok && m.result) {
      result = m.result;
      viewer.setParts(m.result.parts, refocus ? `${params.kind}:${Date.now()}` : `${params.kind}:${params.preset}`);
      refocus = false;
      showFacts();
      setStatus(`完成：${summary()}（${Math.round(m.result.ms)} ms）`);
    } else setStatus(`建模失敗：${m.error ?? '未知錯誤'}`, true);
  }
  if (pending) {
    pending = false;
    run();
  } else {
    waiters.splice(0).forEach((f) => f());
  }
};

function run() {
  if (busy) {
    pending = true;
    return;
  }
  busy = true;
  setStatus('正在建立模型…');
  worker.postMessage({ id: ++seq, params });
  save();
}

function schedule(newShape: boolean) {
  if (newShape) refocus = true;
  clearTimeout(timer);
  timer = window.setTimeout(run, newShape ? 0 : 220);
}

/** 等目前的建模完成（教學用）。 */
function idle(): Promise<void> {
  if (!busy && !pending) return Promise.resolve();
  return new Promise((r) => waiters.push(r));
}

function setStatus(text: string, error = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

const fmt = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d);

function threadName(p = params) {
  const pr = presetById(p.preset);
  if (pr) return pr.label.replace(/（.*?）/, '');
  const prefix = p.profile === 'metric' ? 'M' : p.profile === 'trapezoid' ? 'Tr' : p.profile === 'square' ? 'Sq' : 'Rd';
  return `${prefix}${fmt(p.d)}×${fmt(p.pitch)}${p.starts > 1 ? `（${p.starts} 線）` : ''}`;
}

function summary() {
  const k = KINDS.find((x) => x.id === params.kind)!.label;
  const len = ['bolt', 'kit', 'rod', 'insert', 'standoff'].includes(params.kind) ? ` × ${fmt(params.length, 1)}` : '';
  return `${threadName()}${len} ${k}${params.leftHand ? '（左旋）' : ''}`;
}

function showFacts() {
  if (!result) return;
  const p = params;
  const depth = threadDepth(p);
  const rows: [string, string][] = [];
  if (p.kind !== 'washer') {
    rows.push(['大徑／小徑', `${fmt(p.d)} / ${fmt(p.d - 2 * depth)} mm`]);
    rows.push(['牙高／導程', `${fmt(depth)} / ${fmt(p.pitch * p.starts)} mm`]);
  }
  if (internal(p) && p.kind !== 'washer') rows.push(['母牙孔徑', `${fmt(p.d + 2 * p.clearance - 2 * depth)} mm（間隙 ${fmt(p.clearance)}）`]);
  const vol = result.parts.reduce((s, x) => s + x.volume, 0) / 1000;
  rows.push(['零件', result.parts.map((x) => `${x.name} ${fmt(x.size[0], 1)}×${fmt(x.size[1], 1)}×${fmt(x.size[2], 1)}`).join('、')]);
  rows.push(['體積／PLA 重量', `${fmt(vol)} cm³ ／ 約 ${fmt(vol * 1.24, 1)} g（實心）`]);
  $('#facts').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('#warn').innerHTML = warnings(p).map((w) => `<li>${w}</li>`).join('');
  $<HTMLButtonElement>('#animate').hidden = p.kind !== 'kit';
}

// --- 匯出 -------------------------------------------------------------------------

function fileBase() {
  const k = { bolt: 'screw', nut: 'nut', kit: 'kit', washer: 'washer', rod: 'rod', insert: 'insert', standoff: 'standoff' }[params.kind];
  const len = ['bolt', 'kit', 'rod', 'insert', 'standoff'].includes(params.kind) ? `x${fmt(params.length, 1)}` : '';
  const name = threadName().replace(/[（）\s]/g, '').replace(/×/g, 'x').replace(/線/g, 'start').replace(/[^\w.\-x"]/g, '');
  return `xiaoke-${name || 'thread'}${len}-${k}${params.leftHand ? '-LH' : ''}`.replace(/"/g, 'in');
}

async function ready(): Promise<BuiltPart[]> {
  await idle();
  if (!result) throw new Error('模型還沒建好');
  return result.parts;
}

async function exportStl() {
  const parts = await ready();
  await saveFile(`${fileBase()}.stl`, toStl(parts), 'model/stl');
  setStatus(`已匯出 ${fileBase()}.stl`);
}

async function export3mf() {
  const parts = await ready();
  await saveFile(`${fileBase()}.3mf`, to3mf(parts, summary()), 'model/3mf');
  setStatus(`已匯出 ${fileBase()}.3mf`);
}

async function sendBambu() {
  const xk = desktop();
  const parts = await ready();
  const data = to3mf(parts, summary());
  if (!xk) {
    await saveFile(`${fileBase()}.3mf`, data, 'model/3mf');
    setStatus(mobileApp() ? '3MF 已存好，傳到電腦後用 Bambu Studio 開啟。' : '3MF 已下載，用 Bambu Studio 開啟就能切片列印。');
    return;
  }
  setStatus('正在送到 Bambu Studio…');
  const r = await xk.bambu.open(`${fileBase()}.3mf`, data);
  setStatus(r.ok ? `已在 Bambu Studio 開啟（檔案：${r.path}）` : r.error ? `無法啟動 Bambu Studio：${r.error}（檔案：${r.path}）` : `3MF 已存到 ${r.path}`, !r.ok && !!r.error);
}

// --- 範本與分享 -------------------------------------------------------------------

function mine(): Record<string, Params> {
  try {
    return JSON.parse(localStorage.getItem(`${STORE}:mine`) ?? '{}');
  } catch {
    return {};
  }
}
function renderMine() {
  const sel = $<HTMLSelectElement>('#mine');
  sel.innerHTML = '<option value="">（選擇已存的範本）</option>' + Object.keys(mine()).map((n) => `<option>${n.replace(/</g, '&lt;')}</option>`).join('');
}

function loadParams(p: Params) {
  params = { ...DEFAULTS, ...p };
  renderKinds();
  $<HTMLSelectElement>('#preset').value = params.preset;
  updatePresetNote();
  renderForm();
  schedule(true);
}

// --- 啟動 -------------------------------------------------------------------------

renderKinds();
renderPresets();
renderForm();
renderMine();
$('#version').textContent = `v${VERSION}`;
$('#params').addEventListener('input', onInput);
$('#params').addEventListener('change', onInput);
$('#mode').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (b) setMode(b.dataset.mode as Mode);
});
function setMode(mode: Mode) {
  viewer.setMode(mode);
  document.querySelectorAll<HTMLButtonElement>('#mode button').forEach((x) => x.classList.toggle('on', x.dataset.mode === mode));
}
function setSection(on: boolean) {
  const b = $<HTMLButtonElement>('#section');
  b.setAttribute('aria-pressed', String(on));
  b.classList.toggle('on', on);
  viewer.setSection(on);
}
$('#section').addEventListener('click', () => setSection($('#section').getAttribute('aria-pressed') !== 'true'));
$('#fit').addEventListener('click', () => viewer.fit());
function animate() {
  if (params.kind !== 'kit' || !result) return false;
  if (viewer.getMode() !== 'assembly') setMode('assembly');
  const nut = result.parts.find((x) => x.id === 'nut');
  if (!nut) return false;
  let bottom = Infinity;
  for (let i = 2; i < nut.assembly.positions.length; i += 3) bottom = Math.min(bottom, nut.assembly.positions[i]);
  // 從螺絲末端上方 2 mm 開始旋入
  const from = Math.max(params.pitch * params.starts * 2, params.length - bottom + 2);
  return viewer.screwIn('nut', from, params.pitch * params.starts, params.leftHand);
}
$('#animate').addEventListener('click', () => animate());
const run2 = (fn: () => Promise<void>) => () => fn().catch((e) => setStatus(`失敗：${(e as Error).message}`, true));
$('#dl-stl').addEventListener('click', run2(exportStl));
$('#dl-3mf').addEventListener('click', run2(export3mf));
$('#send-bambu').addEventListener('click', run2(sendBambu));
$('#mine-save').addEventListener('click', () => {
  const name = prompt('範本名稱', summary());
  if (!name) return;
  const all = mine();
  all[name] = params;
  localStorage.setItem(`${STORE}:mine`, JSON.stringify(all));
  renderMine();
  $<HTMLSelectElement>('#mine').value = name;
});
$('#mine').addEventListener('change', () => {
  const n = $<HTMLSelectElement>('#mine').value;
  const p = mine()[n];
  if (p) loadParams(p);
});
$('#mine-del').addEventListener('click', () => {
  const n = $<HTMLSelectElement>('#mine').value;
  if (!n || !confirm(`刪除範本「${n}」？`)) return;
  const all = mine();
  delete all[n];
  localStorage.setItem(`${STORE}:mine`, JSON.stringify(all));
  renderMine();
});
$('#share').addEventListener('click', async () => {
  const base = desktop() || mobileApp() ? 'https://achir1015.github.io/xiaoke-screw/' : location.href.split('#')[0];
  const url = `${base}#p=${btoa(unescape(encodeURIComponent(JSON.stringify(params))))}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('分享連結已複製，貼給朋友就能打開同樣的設定。');
  } catch {
    prompt('複製這個連結', url);
  }
});
$('#reset').addEventListener('click', () => loadParams({ ...DEFAULTS }));
$('.xk-guide-btn').addEventListener('click', () => void startGuide());
$('.xk-update').addEventListener('click', () => void checkUpdate(VERSION));

// 線上版：送到 Bambu Studio 改成下載 3MF，並提供桌面版連結
if (!desktop()) {
  $('#send-bambu').textContent = iosApp() ? '分享 3MF（給 Bambu Studio）' : androidApp() ? '存 3MF（給 Bambu Studio）' : '下載 3MF（給 Bambu Studio）';
  if (!mobileApp()) {
    const a = document.createElement('a');
    a.className = 'desktop-link';
    a.href = 'https://github.com/achir1015/xiaoke-screw/releases/latest';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '⬇ 下載桌面版（Windows／Mac，可一鍵送到 Bambu Studio）';
    $('.credit').before(a);
  }
}
document.documentElement.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);

// 給教學與自動測試用
window.xkApp = {
  setKind,
  setPreset,
  setParams: (v) => setParams(v as Partial<Params>),
  params: () => ({ ...params }),
  load: (p) => loadParams(p as unknown as Params),
  setMode,
  setSection,
  animate,
  openGroup: (id: string, open = true) => {
    const d = document.querySelector<HTMLDetailsElement>(`#params details[data-group="${id}"]`);
    if (d) {
      d.open = open;
      openState[id] = open;
    }
    return d;
  },
  fit: () => viewer.fit(),
  idle,
  result: () => result,
};

run();
setTimeout(() => void checkUpdate(VERSION, true), 4000);
guideOnFirstRun();
