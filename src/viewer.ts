// three.js 3D 預覽：組合圖／列印排版、剖面、旋入動畫。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuiltPart } from './geom/build';

export type Mode = 'assembly' | 'print';

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  readonly controls: OrbitControls;
  private group = new THREE.Group();
  private bed = new THREE.Group();
  private parts: BuiltPart[] = [];
  private meshes = new Map<string, THREE.Mesh>();
  private mode: Mode = 'assembly';
  // 切掉靠近鏡頭（-Y）的那一半，看得到剖開的牙
  private clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sectionOn = false;
  private anim: { id: string; t0: number; from: number; lead: number; dir: number } | null = null;
  private fitted = '';

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    host.append(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(80, -120, 160);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.8);
    fill.position.set(-120, 80, 40);
    this.scene.add(fill);
    this.scene.add(this.group, this.bed);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.tick();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setParts(parts: BuiltPart[], key: string) {
    this.parts = parts;
    this.anim = null;
    this.rebuild();
    // 換了零件種類／規格才重新對焦，單純改數字時保留使用者的視角
    if (this.fitted !== key) {
      this.fitted = key;
      this.fit();
    }
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.anim = null;
    this.rebuild();
    this.fit();
  }

  getMode() {
    return this.mode;
  }

  setSection(on: boolean) {
    this.sectionOn = on;
    for (const m of this.meshes.values()) {
      const mats = m.material as THREE.Material[];
      for (const mat of mats) {
        mat.clippingPlanes = on ? [this.clip] : [];
        mat.needsUpdate = true;
      }
    }
  }

  private rebuild() {
    for (const m of this.meshes.values()) {
      m.geometry.dispose();
      for (const mat of m.material as THREE.Material[]) mat.dispose();
    }
    this.group.clear();
    this.meshes.clear();
    for (const p of this.parts) {
      const src = this.mode === 'assembly' ? p.assembly : p.print;
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(src.positions, 3));
      g.setIndex(new THREE.BufferAttribute(src.indices, 1));
      g = toCreasedNormals(g, (35 * Math.PI) / 180);
      const color = new THREE.Color(p.color);
      const front = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.42, side: THREE.FrontSide });
      // 剖面時看得到的內側面用深色，像切開的斷面
      const back = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.45), side: THREE.BackSide });
      g.clearGroups();
      g.addGroup(0, Infinity, 0);
      g.addGroup(0, Infinity, 1);
      const mesh = new THREE.Mesh(g, [front, back]);
      mesh.name = p.id;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.meshes.set(p.id, mesh);
    }
    this.setSection(this.sectionOn);
    this.drawBed();
  }

  private drawBed() {
    this.bed.clear();
    const box = this.bounds();
    const size = box.isEmpty() ? 60 : Math.max(40, box.getSize(new THREE.Vector3()).length() * 1.6);
    const step = size > 200 ? 20 : size > 80 ? 10 : 5;
    const n = Math.ceil(size / step / 2) * 2;
    const grid = new THREE.GridHelper(n * step, n, 0x8899aa, 0x8899aa);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const z = this.mode === 'print' ? 0 : box.isEmpty() ? 0 : box.min.z - 0.01;
    grid.position.set(Math.round(c.x / step) * step, Math.round(c.y / step) * step, z);
    this.bed.add(grid);
    if (this.mode === 'print') {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(n * step, n * step), new THREE.MeshBasicMaterial({ color: 0x223040, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
      plate.position.copy(grid.position);
      plate.position.z = -0.05;
      this.bed.add(plate);
    }
  }

  private bounds() {
    const box = new THREE.Box3();
    for (const m of this.meshes.values()) {
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix));
    }
    return box;
  }

  fit() {
    const box = this.bounds();
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2);
    const dist = r / Math.sin(((this.camera.fov / 2) * Math.PI) / 180) * 1.05;
    const dir = new THREE.Vector3(1, -1.35, 0.85).normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(c);
    this.controls.update();
  }

  /** 螺帽沿螺紋旋入：從上方 from（mm）處開始，每轉一圈前進一個導程。 */
  screwIn(id: string, from: number, lead: number, leftHand: boolean) {
    if (!this.meshes.get(id) || this.mode !== 'assembly' || lead <= 0) return false;
    this.anim = { id, t0: performance.now(), from, lead, dir: leftHand ? -1 : 1 };
    return true;
  }

  get animating() {
    return !!this.anim;
  }

  private tick() {
    const a = this.anim;
    if (!a) return;
    const m = this.meshes.get(a.id);
    if (!m) {
      this.anim = null;
      return;
    }
    const dur = Math.min(9000, Math.max(2500, (a.from / a.lead) * 450));
    const k = Math.min(1, (performance.now() - a.t0) / dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const off = a.from * (1 - e);
    // 右旋螺紋：沿螺旋線往上退 off，就是逆時針轉 off / 導程 圈
    m.matrix.makeRotationZ(a.dir * 2 * Math.PI * (off / a.lead)).setPosition(0, 0, off);
    m.matrixWorldNeedsUpdate = true;
    if (k >= 1) {
      m.matrix.identity();
      this.anim = null;
    }
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
