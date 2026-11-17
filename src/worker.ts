// 幾何運算放在 Web Worker，畫面不會卡住。
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { build } from './geom/build';
import { initKernel } from './geom/kernel';
import type { Params } from './geom/params';

const ready = initKernel(wasmUrl);

self.onmessage = async (e: MessageEvent<{ id: number; params: Params }>) => {
  const { id, params } = e.data;
  try {
    await ready;
    const r = build(params);
    const transfer: Transferable[] = [];
    for (const p of r.parts) transfer.push(p.assembly.positions.buffer, p.assembly.indices.buffer, p.print.positions.buffer, p.print.indices.buffer);
    (self as unknown as Worker).postMessage({ id, ok: true, result: r }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
