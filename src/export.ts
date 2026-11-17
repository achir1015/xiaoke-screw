// 匯出 STL（二進位，所有零件合成一檔）與 3MF（每個零件一個物件，切片軟體可分開設定）。
import { zipSync, strToU8 } from 'fflate';
import type { BuiltPart } from './geom/build';

export function toStl(parts: BuiltPart[]): ArrayBuffer {
  const tris = parts.reduce((s, p) => s + p.print.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const head = 'Xiaoke Screw Generator';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, tris, true);
  let o = 84;
  for (const p of parts) {
    const P = p.print.positions, I = p.print.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      o += 12;
      for (const v of [a, b, c]) {
        dv.setFloat32(o, P[v], true); dv.setFloat32(o + 4, P[v + 1], true); dv.setFloat32(o + 8, P[v + 2], true);
        o += 12;
      }
      dv.setUint16(o, 0, true);
      o += 2;
    }
  }
  return buf;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const f = (x: number) => (Math.abs(x) < 5e-7 ? '0' : x.toFixed(5).replace(/\.?0+$/, ''));

export function to3mf(parts: BuiltPart[], title: string): ArrayBuffer {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="zh-TW" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(title)}</metadata>`,
    '<metadata name="Application">小柯機器人螺絲3D產生器</metadata>',
    '<resources>',
  ];
  parts.forEach((p, i) => {
    out.push(`<object id="${i + 1}" name="${esc(p.name)}" type="model"><mesh><vertices>`);
    const P = p.print.positions;
    const v: string[] = [];
    for (let k = 0; k < P.length; k += 3) v.push(`<vertex x="${f(P[k])}" y="${f(P[k + 1])}" z="${f(P[k + 2])}"/>`);
    out.push(v.join(''));
    out.push('</vertices><triangles>');
    const I = p.print.indices;
    const t: string[] = [];
    for (let k = 0; k < I.length; k += 3) t.push(`<triangle v1="${I[k]}" v2="${I[k + 1]}" v3="${I[k + 2]}"/>`);
    out.push(t.join(''));
    out.push('</triangles></mesh></object>');
  });
  out.push('</resources><build>');
  parts.forEach((_, i) => out.push(`<item objectid="${i + 1}"/>`));
  out.push('</build></model>');
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(out.join('')),
  };
  const zip = zipSync(files, { level: 6 });
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}
