// 桌面版冒煙測試：啟動 Electron（或 XK_EXE 指定的打包版），透過 CDP 操作畫面。
// 用法：node e2e/desktop.mjs [--bambu]   --bambu 會真的把 3MF 送到 Bambu Studio
import { spawn, execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = 9357;
const exe = process.env.XK_EXE;
const MAC = process.platform === 'darwin';
const electron = MAC
  ? join(process.cwd(), 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  : join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe');
const child = exe
  ? spawn(exe, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' })
  : spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let fail = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✔' : '✘'} ${name}${info ? ` — ${info}` : ''}`);
};

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('xkscrew://'));
      if (page) return page;
    } catch {
      // 還沒啟動
    }
    await sleep(500);
  }
  throw new Error('找不到視窗');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => new Promise((r) => {
  const id = ++seq;
  pending.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const waitFor = async (expr, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(`return !!(${expr})`)) return true;
    await sleep(300);
  }
  return false;
};
const status = () => evaluate("return document.querySelector('#status').textContent");
const settle = () => evaluate('await new Promise((r) => setTimeout(r, 400)); await window.xkApp.idle(); return 1');

try {
  await waitFor('document.readyState === "complete"');
  // 第一次開啟會自動播放教學：先關掉
  const firstRun = await waitFor("document.querySelector('.xk-guide')", 4000);
  if (firstRun) console.log('（第一次開啟，自動播放的教學先關掉）');
  await evaluate("document.querySelector('.xk-close')?.click(); return 1");
  await waitFor("!document.querySelector('.xk-guide')", 15000);
  check('視窗標題', (await evaluate('return document.title')).includes('小柯機器人螺絲3D產生器'));
  check('桌面橋接 window.xk', await evaluate('return typeof window.xk?.bambu?.open === "function"'));
  check('七種零件卡片', (await evaluate("return document.querySelectorAll('#kinds button').length")) === 7);
  check('有語音教學與更新按鈕', await evaluate("return !!document.querySelector('.xk-guide-btn') && !!document.querySelector('.xk-update')"));
  await evaluate("window.xkApp.load({ kind: 'kit', preset: 'M8' }); return 1");
  await settle();
  check('M8 套組建好', /完成：M8 × \d+ 螺絲＋螺帽/.test(await status()), await status());
  check('套組有三個零件', (await evaluate('return window.xkApp.result().parts.length')) === 3);
  await evaluate("window.xkApp.setParams({ length: 40, head: 'socket', nutType: 'flange' }); return 1");
  await settle();
  check('改參數後重建', /M8 × 40/.test(await status()), await status());
  await evaluate("window.xkApp.setPreset('T8'); window.xkApp.setKind('rod'); return 1");
  await settle();
  check('T8 四線絲桿', /T8.*螺紋桿/.test(await status()), await status());
  check('送到 Bambu Studio 按鈕文字', (await evaluate("return document.querySelector('#send-bambu').textContent")) === '送到 Bambu Studio');
  const found = await evaluate('return window.xk.bambu.find()');
  check('找到 Bambu Studio', !!found, found ?? '');
  check('語系繁中', (await evaluate('return document.documentElement.lang')) === 'zh-Hant-TW');
  // 教學能啟動、換到下一步、關閉後還原設定
  await evaluate("document.querySelector('.xk-guide-btn').click(); return 1");
  check('教學出現', await waitFor("document.querySelector('.xk-text')?.textContent.length > 5", 8000));
  await evaluate("document.querySelector('.xk-next').click(); return 1");
  check('教學下一步', await waitFor("document.querySelector('.xk-count')?.textContent.startsWith('2 /')", 8000));
  await evaluate("document.querySelector('.xk-close').click(); return 1");
  check('教學可關閉', await waitFor("!document.querySelector('.xk-guide')", 15000));
  await settle();
  check('教學結束後還原成 T8 螺紋桿', /T8.*螺紋桿/.test(await status()), await status());

  if (process.argv.includes('--bambu')) {
    await evaluate("window.xkApp.load({ kind: 'kit' }); window.xkApp.setPreset('M10'); window.xkApp.setParams({ length: 35 }); return 1");
    await settle();
    const t0 = Date.now();
    await evaluate("document.querySelector('#send-bambu').click(); return 1");
    check('送出後顯示已開啟', await waitFor("/Bambu Studio 開啟/.test(document.querySelector('#status').textContent)", 60000), await status());
    const docs = MAC ? join(homedir(), 'Documents') : execSync("powershell -NoProfile -Command \"[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')\"", { encoding: 'utf8' }).trim() || join(homedir(), 'Documents');
    const dir = join(docs, '小柯螺絲');
    const fresh = existsSync(dir) && readdirSync(dir).filter((f) => f.endsWith('.3mf') && statSync(join(dir, f)).mtimeMs >= t0 - 1000);
    check('3MF 存到 文件\\小柯螺絲', fresh && fresh.length > 0, fresh ? fresh.join(', ') : '');
    await sleep(4000);
    const running = MAC ? execSync('pgrep -fl BambuStudio || true', { encoding: 'utf8' }) : execSync('tasklist /FI "IMAGENAME eq bambu-studio.exe" /NH', { encoding: 'utf8' });
    check('Bambu Studio 已啟動', /bambu-?studio/i.test(running));
  }
} catch (e) {
  fail++;
  console.log('✘ 例外', e.message);
} finally {
  ws.close();
  try {
    if (MAC) child.kill('SIGTERM');
    else execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // 已結束
  }
  console.log(`\n通過 ${ok}，失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
}
