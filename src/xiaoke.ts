// 小柯機器人螺絲3D產生器：桌面版／手機 App 橋接、語音動態教學、版本更新。
export const APP_NAME = '小柯機器人螺絲3D產生器';
const getLang = () => 'zh';

export interface UpdateInfo {
  current: string;
  latest: string;
  newer: boolean;
  notes: string;
  page: string;
  canInstall: boolean;
  flavor: string;
}

/** Electron preload 提供的介面；線上版沒有。 */
export interface DesktopBridge {
  bambu: {
    open(name: string, data: ArrayBuffer): Promise<{ ok: boolean; path?: string; exe?: string; error?: string }>;
    find(): Promise<string | null>;
    pick(): Promise<string | null>;
  };
  update: {
    check(): Promise<UpdateInfo>;
    download(): Promise<string>;
    install(file: string): Promise<{ quitting?: boolean; manual?: boolean; path?: string }>;
    openPage(): Promise<void>;
    onProgress(fn: (d: { got: number; total: number }) => void): () => void;
  };
  version: string;
}

export interface AppHook {
  setKind(kind: string): void;
  setPreset(id: string): void;
  setParams(values: Record<string, unknown>): void;
  params(): Record<string, unknown>;
  load(p: Record<string, unknown>): void;
  setMode(mode: 'assembly' | 'print'): void;
  setSection(on: boolean): void;
  animate(): boolean;
  openGroup(group: string, open?: boolean): HTMLDetailsElement | null;
  fit(): void;
  idle(): Promise<void>;
  result(): unknown;
}

declare global {
  interface Window {
    xk?: DesktopBridge;
    xkApp: AppHook;
  }
}

export const desktop = (): DesktopBridge | undefined => window.xk;

// --- iPhone／iPad App（WKWebView）：存檔改用分享選單 ------------------------------------

interface IOSBridge {
  postMessage(msg: { cmd: string; args?: unknown[] }): Promise<{ status?: string; token?: string; message?: string } | boolean | null>;
}
/** 在 iPhone／iPad App 裡執行時，App 注入 window.XiaokeIOS = true 與 xkq 訊息通道。 */
export const iosApp = (): IOSBridge | undefined => {
  const w = window as unknown as { XiaokeIOS?: boolean; webkit?: { messageHandlers?: { xkq?: IOSBridge } } };
  return w.XiaokeIOS ? w.webkit?.messageHandlers?.xkq : undefined;
};

// --- Android App（WebView）：window.XiaokeAndroid，回傳值都是 JSON 字串 ----------------------

interface AndroidBridge {
  beginSave(name: string): string;
  writeChunk(token: string, b64: string): string;
  endSave(token: string): string;
  checkUpdate(): string;
  installUpdate(url: string, ver: string): string;
  updateStatus(): string;
  openUrl(url: string): boolean;
  ttsAvailable(): boolean;
  ttsSpeak(text: string, rate: number, id: string): void;
  ttsStop(): void;
}
export const androidApp = (): AndroidBridge | undefined => (window as unknown as { XiaokeAndroid?: AndroidBridge }).XiaokeAndroid;
/** 手機 App（iOS 或 Android）裡執行。 */
export const mobileApp = () => !!(iosApp() || androidApp());

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 存檔：iOS App 分段傳給 App 再打開分享選單；其他環境用瀏覽器下載。 */
export async function saveFile(name: string, data: ArrayBuffer, mime: string): Promise<void> {
  const android = androidApp();
  if (android) {
    const begin = JSON.parse(android.beginSave(name)) as { status: string; token?: string; message?: string };
    if (begin.status !== 'ok' || !begin.token) throw new Error(begin.message ?? '無法建立檔案');
    const bytes = new Uint8Array(data);
    const CHUNK = 256 * 1024;
    for (let i = 0; i < bytes.length; i += CHUNK) android.writeChunk(begin.token, toBase64(bytes.subarray(i, i + CHUNK)));
    android.endSave(begin.token);
    return;
  }
  const ios = iosApp();
  if (ios) {
    const begin = (await ios.postMessage({ cmd: 'begin_save', args: [name] })) as { status?: string; token?: string };
    if (begin?.status !== 'ok' || !begin.token) throw new Error('無法建立檔案');
    const bytes = new Uint8Array(data);
    const CHUNK = 512 * 1024;
    for (let i = 0; i < bytes.length; i += CHUNK) await ios.postMessage({ cmd: 'write_chunk', args: [begin.token, toBase64(bytes.subarray(i, i + CHUNK))] });
    await ios.postMessage({ cmd: 'end_save', args: [begin.token] });
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- 語音動態教學 ----------------------------------------------------------------

interface Step {
  /** 要框起來的元素（找不到就置中顯示）。 */
  target?: () => HTMLElement | null;
  zh: string;
  en: string;
  /** 說話前先做的示範動作。 */
  before?: () => void | Promise<void>;
  /** 說話途中的動畫示範。 */
  demo?: () => Promise<void>;
  /** 線上版改用的說明。 */
  web?: { zh: string; en: string };
  /** iPhone／iPad App 改用的說明。 */
  ios?: { zh: string; en: string };
  /** Android App 改用的說明。 */
  android?: { zh: string; en: string };
}

const app = () => window.xkApp;
const built = async () => {
  await sleep(120);
  await app().idle();
};
const group = (g: string) => () => app().openGroup(g, true);
const field = (key: string) => () => $(`#params [data-key="${key}"]`);

const STEPS: Step[] = [
  {
    before: async () => {
      app().setMode('assembly');
      app().setSection(false);
      app().setKind('kit');
      app().setPreset('M8');
      await built();
    },
    zh: '你好，我是小柯機器人！歡迎使用小柯機器人螺絲3D產生器。我會一步一步帶你做出可以直接列印、而且真的鎖得起來的螺絲和螺帽。',
    en: 'Hi, I am Xiaoke the robot! Welcome to the screw and nut generator.',
  },
  {
    target: () => $('#kinds'),
    zh: '第一步，選擇零件。可以做螺絲、螺帽、整組螺絲加螺帽、墊圈、螺紋桿、螺紋嵌件和支柱。看，我依序點螺絲、螺帽，再回到整組。',
    en: 'Step one: pick a part – screw, nut, a full kit, washer, threaded rod, insert or standoff.',
    demo: async () => {
      app().setKind('bolt');
      await built();
      await sleep(900);
      app().setKind('nut');
      await built();
      await sleep(900);
      app().setKind('kit');
      await built();
    },
  },
  {
    target: () => $('#viewer'),
    zh: '右邊是 3D 預覽。滑鼠左鍵拖曳旋轉、右鍵拖曳平移、滾輪縮放；手機可以用手指拖曳和兩指縮放。模型都在你的裝置上即時計算，不會上傳。',
    en: 'This is the 3D preview: drag to rotate, right-drag to pan, scroll to zoom.',
  },
  {
    target: () => $('#preset'),
    zh: '第二步，選擇規格。有公制粗牙、細牙、英制，像相機用的四分之一吋螺絲，還有梯形牙絲桿和列印友善大牙。我把 M8 換成 M12。',
    en: 'Step two: pick a size – metric coarse and fine, UNC, trapezoidal lead screws and print-friendly big threads.',
    demo: async () => {
      await sleep(1500);
      app().setPreset('M12');
      await built();
    },
  },
  {
    before: () => {
      app().openGroup('size', true);
    },
    target: field('length'),
    zh: '第三步，調整參數。螺桿長度可以自由設定，我把它從三十公釐拉長到四十五公釐，預覽會馬上跟著變。',
    en: 'Step three: adjust the parameters. Watch the length grow from 30 to 45 mm.',
    demo: async () => {
      for (const l of [30, 35, 40, 45]) {
        app().setParams({ length: l });
        await sleep(650);
      }
      await built();
    },
  },
  {
    before: () => {
      app().openGroup('head', true);
    },
    target: group('head'),
    zh: '「螺絲頭」有六角頭、法蘭頭、內六角、沉頭、圓頭、滾花手轉頭等等，起子槽也能選一字、十字、內六角或梅花。示範換成內六角圓柱頭，再換成滾花頭，不用工具就能手轉。',
    en: 'Heads: hex, flange, socket cap, countersunk, button, knurled and more, with slot, Phillips, hex or Torx drives.',
    demo: async () => {
      await sleep(1500);
      app().setParams({ head: 'socket' });
      await built();
      await sleep(1600);
      app().setParams({ head: 'knurled' });
      await built();
    },
  },
  {
    before: () => {
      app().openGroup('nut', true);
    },
    target: group('nut'),
    zh: '「螺帽」可以選六角、法蘭、蓋形、蝶形和滾花螺帽。我換成蝶形螺帽，用手指就能鎖。',
    en: 'Nuts: hex, flange, cap, wing and knurled. Here is a wing nut.',
    demo: async () => {
      await sleep(1200);
      app().setParams({ nutType: 'wing' });
      await built();
    },
  },
  {
    before: () => {
      app().openGroup('thread', true);
    },
    target: group('thread'),
    zh: '「螺紋」是重點。三角牙就是一般的公制螺紋；梯形牙是平頂的 ACME 類牙型，牙尖不容易下垂或黏在一起，3D 列印更好用。還能設定多線螺紋和左旋反牙。',
    en: 'Threads: the regular 60° profile, or a flat-topped trapezoid (ACME-like) that prints much better. Multi-start and left-hand are supported too.',
    demo: async () => {
      await sleep(2500);
      app().setPreset('P10');
      await built();
    },
  },
  {
    target: field('clearance'),
    zh: '「配合間隙」決定鎖起來的鬆緊。3D 列印的塑膠會稍微膨脹，所以母牙要留一點空隙，建議零點一五到零點三公釐。印出來太緊就加大，太鬆就調小。',
    en: 'Clearance sets how tight the fit is. 0.15 – 0.3 mm works for most FDM printers.',
  },
  {
    before: () => app().setSection(true),
    target: () => $('#toolbar'),
    zh: '工具列可以切換組合圖和列印排版，也能開剖面，看螺絲和螺帽的牙怎麼咬合。按「旋入動畫」，螺帽會沿著螺紋一圈一圈鎖進去。',
    en: 'The toolbar switches between the assembly and the print layout, shows a cross-section, and plays a screw-in animation.',
    demo: async () => {
      await sleep(2600);
      app().setSection(false);
      app().animate();
      await sleep(4200);
      app().setMode('print');
      await sleep(1500);
    },
  },
  {
    before: () => {
      const t = $<HTMLDetailsElement>('#tips');
      if (t) t.open = true;
    },
    target: () => $('#info'),
    zh: '這裡會列出大徑、小徑、牙高、導程、母牙孔徑和重量，有需要注意的地方也會提醒。「列印小技巧」整理了層高、牆線、材料和太緊太鬆的解法。',
    en: 'Here are the thread dimensions, weight and warnings, plus printing tips.',
  },
  {
    before: () => {
      const t = $<HTMLDetailsElement>('#tips');
      if (t) t.open = false;
    },
    target: () => $('#export'),
    zh: '做好後可以下載 STL 或 3MF。3MF 會把螺絲、螺帽、墊圈分成不同物件，在切片軟體裡可以個別設定。',
    en: 'Export STL or 3MF; 3MF keeps every part as a separate object.',
  },
  {
    target: () => $('#send-bambu'),
    zh: '最方便的是這顆「送到 Bambu Studio」：按一下，零件會直接在拓竹 Bambu Studio 裡打開，而且已經直立擺好，接著切片就能列印。',
    en: 'Send to Bambu Studio opens the parts there directly, already standing upright, ready to slice.',
    android: {
      zh: '這顆綠色按鈕會把 3MF 存到手機的「下載／小柯螺絲」資料夾，傳到電腦後用拓竹 Bambu Studio 打開就能切片列印。',
      en: 'The green button saves the 3MF to Downloads on your phone; open it in Bambu Studio on your computer.',
    },
    ios: {
      zh: '這顆綠色按鈕會打開分享選單：可以把 3MF 存到「檔案」，或用 AirDrop 傳給電腦，再用拓竹 Bambu Studio 打開切片列印。',
      en: 'The green button opens the share sheet: save the 3MF to Files or AirDrop it to your computer.',
    },
    web: {
      zh: '這顆綠色按鈕會下載 3MF 檔，用拓竹 Bambu Studio 打開就能切片列印。想一鍵直接送進 Bambu Studio，可以安裝左下角的桌面版。',
      en: 'The green button downloads a 3MF to open in Bambu Studio. The desktop version can send it there in one click.',
    },
  },
  {
    before: () => {
      const d = $<HTMLDetailsElement>('#project');
      if (d) d.open = true;
    },
    target: () => $('#project'),
    zh: '「我的範本與分享」可以把常用的設定存起來，或複製連結分享給朋友。',
    en: 'Save your favourite settings as templates or copy a link to share them.',
  },
  {
    before: () => {
      const d = $<HTMLDetailsElement>('#project');
      if (d) d.open = false;
      app().setMode('assembly');
    },
    target: () => $('.xk-update'),
    zh: '這顆按鈕會檢查新版本，有更新就能直接下載安裝。教學到這裡結束，祝你列印順利！想再聽一次，按旁邊的小柯機器人按鈕就可以了。',
    en: 'This button checks for updates. That is the end of the guide – happy printing!',
  },
];

let running = false;
/** 立刻結束目前這句話（有些語音引擎 cancel 後不會觸發 onend）。 */
let cutSpeech: (() => void) | null = null;
let stopRequested = false;

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const zh = getLang() === 'zh';
  const want = zh ? [/zh[-_]TW/i, /Hanhan|Yating|Zhiwei|HsiaoChen|HsiaoYu|Mei-Jia/i, /zh[-_]HK/i, /zh/i] : [/en[-_]US/i, /en/i];
  for (const re of want) {
    const v = voices.find((x) => re.test(x.lang) || re.test(x.name));
    if (v) return v;
  }
  return undefined;
}

let ttsSeq = 0;
const ttsWaiting = new Map<string, () => void>();
(window as unknown as { __xkTtsDone?: (id: string) => void }).__xkTtsDone = (id: string) => {
  ttsWaiting.get(id)?.();
  ttsWaiting.delete(id);
};
/** Android 的 WebView 沒有網頁語音：改用系統的文字轉語音。 */
function speakAndroid(android: AndroidBridge, text: string, mouth: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const id = `t${++ttsSeq}`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cutSpeech = null;
      ttsWaiting.delete(id);
      mouth.classList.remove('talk');
      resolve();
    };
    cutSpeech = () => {
      android.ttsStop();
      finish();
    };
    ttsWaiting.set(id, finish);
    mouth.classList.add('talk');
    setTimeout(finish, Math.max(4000, text.length * 300) + 2000);
    android.ttsSpeak(text, 1.0, id);
  });
}

function speak(text: string, mouth: HTMLElement): Promise<void> {
  const android = androidApp();
  if (android?.ttsAvailable()) return speakAndroid(android, text, mouth);
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      setTimeout(resolve, Math.max(2500, text.length * 180));
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? (getLang() === 'zh' ? 'zh-TW' : 'en-US');
    u.rate = 1.02;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cutSpeech = null;
      mouth.classList.remove('talk');
      resolve();
    };
    cutSpeech = finish;
    u.onstart = () => mouth.classList.add('talk');
    u.onend = finish;
    u.onerror = finish;
    // 有些環境沒有語音，或不會觸發 onend：依字數估一個保底時間
    setTimeout(finish, Math.max(4000, text.length * 260) + 1500);
    speechSynthesis.speak(u);
  });
}

const ROBOT_SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <line x1="60" y1="8" x2="60" y2="22" stroke="#5a6478" stroke-width="4"/>
  <circle cx="60" cy="8" r="7" fill="#ffc428"/>
  <rect x="6" y="50" width="12" height="32" rx="5" fill="#2878dc"/>
  <rect x="102" y="50" width="12" height="32" rx="5" fill="#2878dc"/>
  <circle cx="60" cy="66" r="48" fill="#4696f0"/>
  <circle cx="60" cy="66" r="44" fill="#f0f6ff"/>
  <rect x="25" y="44" width="70" height="42" rx="20" fill="#182440"/>
  <path class="eye" d="M36 62 q9 -10 18 0" stroke="#5ae6ff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path class="eye" d="M66 62 q9 -10 18 0" stroke="#5ae6ff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse class="mouth" cx="60" cy="75" rx="9" ry="3" fill="#5ae6ff"/>
  <circle cx="32" cy="80" r="5" fill="#ff8ca0" opacity=".8"/>
  <circle cx="88" cy="80" r="5" fill="#ff8ca0" opacity=".8"/>
</svg>`;

export async function startGuide() {
  if (running) return;
  running = true;
  stopRequested = false;
  // 教學會示範改參數：結束後還原使用者原本的設定
  const saved = app().params();
  let index = 0;
  let jump: number | null = null;
  let paused = false;

  const layer = document.createElement('div');
  layer.className = 'xk-guide';
  layer.innerHTML = `
    <div class="xk-spot"></div>
    <div class="xk-bubble" role="dialog" aria-live="polite">
      <div class="xk-robot">${ROBOT_SVG}</div>
      <div class="xk-body">
        <p class="xk-text"></p>
        <div class="xk-bar"><span class="xk-count"></span>
          <button type="button" class="ghost xk-prev">◀</button>
          <button type="button" class="ghost xk-pause">⏸</button>
          <button type="button" class="ghost xk-next">▶</button>
          <button type="button" class="ghost xk-close">✕</button>
        </div>
      </div>
    </div>`;
  document.body.append(layer);
  const spot = layer.querySelector<HTMLElement>('.xk-spot')!;
  const bubble = layer.querySelector<HTMLElement>('.xk-bubble')!;
  const text = layer.querySelector<HTMLElement>('.xk-text')!;
  const count = layer.querySelector<HTMLElement>('.xk-count')!;
  const robot = layer.querySelector<HTMLElement>('.xk-robot')!;
  const pauseBtn = layer.querySelector<HTMLButtonElement>('.xk-pause')!;
  let wake: (() => void) | null = null;
  const interrupt = () => {
    androidApp()?.ttsStop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    cutSpeech?.();
    wake?.();
  };
  layer.querySelector('.xk-prev')!.addEventListener('click', () => {
    jump = Math.max(0, index - 1);
    interrupt();
  });
  layer.querySelector('.xk-next')!.addEventListener('click', () => {
    jump = index + 1;
    interrupt();
  });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶︎ ' + (getLang() === 'zh' ? '繼續' : 'Go') : '⏸';
    if (paused && androidApp()) androidApp()!.ttsStop();
    if (paused && 'speechSynthesis' in window) speechSynthesis.pause();
    else {
      if ('speechSynthesis' in window) speechSynthesis.resume();
      wake?.();
    }
  });
  layer.querySelector('.xk-close')!.addEventListener('click', () => {
    stopRequested = true;
    interrupt();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      stopRequested = true;
      interrupt();
    }
  };
  document.addEventListener('keydown', onKey);

  const scrolled = new WeakSet<HTMLElement>();
  const place = (target: HTMLElement | null) => {
    if (!target || target.offsetParent === null) {
      spot.classList.add('none');
      bubble.style.left = '50%';
      bubble.style.top = '50%';
      bubble.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const form = target.closest('#scroll');
    if (form && !scrolled.has(target)) {
      scrolled.add(target);
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (!form) target.scrollIntoView({ block: 'nearest' });
    // 在表單裡的元素只框可見的部分
    const full = target.getBoundingClientRect();
    const clip = form?.getBoundingClientRect();
    const r = clip
      ? { left: full.left, right: full.right, width: full.width, top: Math.max(full.top, clip.top), bottom: Math.min(full.bottom, clip.bottom), height: 0 }
      : { left: full.left, right: full.right, width: full.width, top: full.top, bottom: full.bottom, height: full.height };
    r.height = Math.max(0, r.bottom - r.top);
    const pad = 6;
    spot.classList.remove('none');
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const bw = Math.min(460, window.innerWidth - 24);
    const bh = bubble.offsetHeight || 160;
    let left = r.right + 18;
    let top = r.top;
    if (left + bw > window.innerWidth - 12) left = r.left - bw - 18;
    if (left < 12) {
      left = Math.max(12, Math.min(window.innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
      top = r.bottom + 18;
      if (top + bh > window.innerHeight - 12) top = r.top - bh - 18;
    }
    top = Math.max(12, Math.min(window.innerHeight - bh - 12, top));
    Object.assign(bubble.style, { left: `${left}px`, top: `${top}px`, transform: 'none' });
  };

  try {
    while (index < STEPS.length && !stopRequested) {
      const step = STEPS[index];
      jump = null;
      count.textContent = `${index + 1} / ${STEPS.length}`;
      await step.before?.();
      await sleep(250);
      if (stopRequested) break;
      if (jump !== null) {
        index = jump;
        continue;
      }
      const said = androidApp() && step.android ? step.android : iosApp() && step.ios ? step.ios : !desktop() && step.web ? step.web : step;
      const line = getLang() === 'zh' ? said.zh : said.en;
      text.textContent = line;
      robot.classList.remove('pop');
      void robot.offsetWidth;
      robot.classList.add('pop');
      const target = step.target?.() ?? null;
      place(target);
      const follow = setInterval(() => place(step.target?.() ?? null), 400);
      await Promise.all([speak(line, robot), step.demo?.().then(() => sleep(400))]);
      clearInterval(follow);
      while (paused && !stopRequested && jump === null) await new Promise<void>((r) => (wake = r));
      wake = null;
      if (jump === null && !stopRequested) await sleep(600);
      index = jump ?? index + 1;
    }
  } finally {
    androidApp()?.ttsStop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    document.removeEventListener('keydown', onKey);
    layer.remove();
    running = false;
    app().setSection(false);
    app().setMode('assembly');
    app().load(saved);
    try {
      localStorage.setItem('xiaoke-screw:guided', '1');
    } catch {
      // 無痕模式等情況：下次再自動播放也無妨
    }
  }
}

/** 第一次開啟時自動播放教學。 */
export function guideOnFirstRun() {
  let seen = '1';
  try {
    seen = localStorage.getItem('xiaoke-screw:guided') ?? '';
  } catch {
    seen = '1';
  }
  if (!seen && !/[?&]noguide/.test(location.search)) setTimeout(() => void startGuide(), 1200);
}

// --- 版本更新 ---------------------------------------------------------------------

const UPDATE_REPO = 'achir1015/xiaoke-screw';
const PAGES = 'https://achir1015.github.io/xiaoke-screw';

function cmpVer(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

function dialog(html: string): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'xk-dialog';
  d.innerHTML = `<form method="dialog">${html}</form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function checkUpdate(current: string, quiet = false) {
  const xk = desktop();
  try {
    let info: UpdateInfo;
    const android = androidApp();
    let apkUrl = '';
    if (xk) info = await xk.update.check();
    else if (android) {
      const j = JSON.parse(android.checkUpdate()) as { status: string; current: string; latest: string; url: string; page: string; notes: string; message?: string };
      if (j.status !== 'ok') throw new Error(j.message ?? '查詢失敗');
      apkUrl = j.url;
      info = { current: j.current, latest: j.latest, newer: cmpVer(j.latest, j.current) > 0, notes: j.notes, page: j.page, canInstall: !!j.url, flavor: 'android' };
    } else if (iosApp()) {
      const res = await fetch(`${PAGES}/version.json?t=${Date.now()}`, { cache: 'no-store' });
      const j = (await res.json()) as { version: string; notes?: string };
      info = { current, latest: j.version, newer: cmpVer(j.version, current) > 0, notes: j.notes ?? '', page: `${PAGES}/ios/`, canInstall: true, flavor: 'ios' };
    } else {
      // 線上版：比對 version.json，有新版就重新整理頁面（略過快取）
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      const j = (await res.json()) as { version: string; notes?: string };
      info = { current, latest: j.version, newer: cmpVer(j.version, current) > 0, notes: j.notes ?? '', page: `https://github.com/${UPDATE_REPO}/releases/latest`, canInstall: true, flavor: 'web' };
    }
    if (!info.newer) {
      if (!quiet) dialog(`<h2>已是最新版</h2><p>目前版本 v${esc(info.current)} 就是最新版。</p><button class="ghost">關閉</button>`);
      return;
    }
    const d = dialog(`<h2>有新版本 v${esc(info.latest)}</h2><p>目前版本 v${esc(info.current)}</p>
      ${info.notes ? `<pre class="xk-notes">${esc(info.notes)}</pre>` : ''}
      <progress hidden max="1" value="0"></progress><p class="xk-msg"></p>
      <div class="xk-row"><button type="button" class="xk-go">${info.canInstall ? (xk || android ? '下載並安裝' : iosApp() ? '前往安裝頁更新' : '立即更新') : '開啟下載頁'}</button><button class="ghost">稍後</button></div>`);
    const go = d.querySelector<HTMLButtonElement>('.xk-go')!;
    const bar = d.querySelector<HTMLProgressElement>('progress')!;
    const msg = d.querySelector<HTMLElement>('.xk-msg')!;
    go.addEventListener('click', async () => {
      if (android) {
        go.disabled = true;
        bar.hidden = false;
        android.installUpdate(apkUrl, info.latest);
        const timer = setInterval(() => {
          const st = JSON.parse(android.updateStatus()) as { state: string; pct: number };
          bar.value = st.pct / 100;
          msg.textContent =
            st.state === 'permission' ? '請在設定畫面允許「安裝未知應用程式」，回來後再按一次。'
            : st.state === 'downloading' ? `下載中 ${st.pct}%`
            : st.state === 'launching' ? '下載完成，請在跳出的畫面按「更新」。'
            : st.state === 'error' ? '更新失敗，請稍後再試。' : '';
          if (st.state !== 'downloading') {
            clearInterval(timer);
            go.disabled = false;
          }
        }, 500);
        return;
      }
      if (iosApp()) {
        await iosApp()!.postMessage({ cmd: 'open_url', args: [`${PAGES}/ios/`] });
        return;
      }
      if (!xk) {
        location.reload();
        return;
      }
      if (!info.canInstall) {
        await xk.update.openPage();
        return;
      }
      go.disabled = true;
      bar.hidden = false;
      const off = xk.update.onProgress(({ got, total }) => {
        if (total) bar.value = got / total;
        msg.textContent = `下載中 ${(got / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`;
      });
      try {
        const file = await xk.update.download();
        msg.textContent = '下載完成，正在安裝，程式會自動重新開啟…';
        const r = await xk.update.install(file);
        if (r.manual) msg.textContent = `已下載到 ${r.path}，請手動開啟安裝。`;
      } catch (e) {
        msg.textContent = `更新失敗：${(e as Error).message}`;
        go.disabled = false;
      } finally {
        off();
      }
    });
  } catch (e) {
    if (!quiet) dialog(`<h2>無法檢查更新</h2><p>${esc((e as Error).message)}</p><button class="ghost">關閉</button>`);
  }
}
