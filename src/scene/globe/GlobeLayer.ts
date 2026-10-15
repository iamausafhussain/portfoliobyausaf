/**
 * The globe on the shared stage (spec 05 GL-1 – GL-8): matte sphere, atmosphere rim,
 * dot-matrix land, home and project nodes, routes and travelling packets. It follows a
 * DOM "slot" element (so CSS decides where it sits and sticky positioning pins it) and
 * forms out of the hero's particle cloud as its chapter scrolls in.
 */
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  Group,
  LineSegments,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { GlobeApi, GlobeHandle, GlobeNode, ScreenPoint } from '../../chapters/system/globeHandle';
import type { Tier } from '../../device/tier';
import { themes } from '../../theme/tokens';
import { getHeroCloud, setFormation } from '../hero/handoff';
import { seeded, toRgb } from '../hero/sampling';
import type { FrameInfo, StageLayer } from '../stage/Stage';
import { alongArc, arcPoints, formationProgress, HOME, latLngToVec3, type LandDots, type Vec3 } from './geo';
import { GlobeRig } from './rig';
import arcsFrag from './shaders/arcs.frag?raw';
import arcsVert from './shaders/arcs.vert?raw';
import bodyFrag from './shaders/body.frag?raw';
import bodyVert from './shaders/body.vert?raw';
import dotsFrag from './shaders/dots.frag?raw';
import dotsVert from './shaders/dots.vert?raw';
import glowFrag from './shaders/glow.frag?raw';
import glowVert from './shaders/glow.vert?raw';
import rimFrag from './shaders/rim.frag?raw';

const FOV = 30;
const premultiplied = {
  transparent: true,
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
} as const;

const dark = themes.dark.color;
const light = themes.light.color;
const C = {
  baseDark: toRgb(dark.globeBase),
  baseLight: toRgb(light.globeBase),
  dotDark: toRgb(dark.fg),
  dotLight: toRgb(light.fg),
  accentDark: toRgb(dark.accent),
  accentLight: toRgb(light.accent),
  routeDark: toRgb(dark.accent2),
  routeLight: toRgb(light.accent2Text),
  fgLight: toRgb(light.fg),
};
const mixRgb = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface GlobeLayerOptions {
  canvas: HTMLCanvasElement;
  /** where the globe sits on screen (its centre and size follow this element) */
  slot: HTMLElement;
  /** the chapter element (formation starts as its top scrolls into view) */
  chapter: HTMLElement;
  handle: GlobeHandle;
  dots: LandDots;
  tier: Tier;
}

interface Route {
  nodeIndex: number;
  points: Vec3[];
}

export class GlobeLayer implements StageLayer, GlobeApi {
  private readonly o: GlobeLayerOptions;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private group = new Group();
  private rig = new GlobeRig(HOME);
  private body: Mesh<SphereGeometry, ShaderMaterial>;
  private rim: Mesh<SphereGeometry, ShaderMaterial>;
  private dots: Points<BufferGeometry, ShaderMaterial>;
  private nodes: Points<BufferGeometry, ShaderMaterial>;
  private packets: Points<BufferGeometry, ShaderMaterial>;
  private arcs: LineSegments<BufferGeometry, ShaderMaterial>;
  private nodeList: GlobeNode[] = [];
  private routes: Route[] = [];
  private packetsPerRoute: number;
  private focusId: string | null = null;
  private hoverId: string | null = null;
  private formation = 0;
  private screen = new Map<string, ScreenPoint>();
  private dragAt = 0;
  private visible = false;
  private width = 1;
  private height = 1;

  constructor(renderer: WebGLRenderer, o: GlobeLayerOptions) {
    this.o = o;
    const high = o.tier === 'high';
    this.packetsPerRoute = high ? 2 : 1;
    this.scene.add(this.group);
    this.group.rotation.order = 'XYZ';

    // sphere and rim
    const bodyMat = new ShaderMaterial({
      vertexShader: bodyVert,
      fragmentShader: bodyFrag,
      ...premultiplied,
      depthWrite: true,
      uniforms: {
        uDark: { value: C.baseDark },
        uLight: { value: C.baseLight },
        uGlow: { value: 1 },
        uOpacity: { value: 0 },
      },
    });
    this.body = new Mesh(new SphereGeometry(1, 64, 48), bodyMat);
    this.group.add(this.body);
    const rimMat = new ShaderMaterial({
      vertexShader: bodyVert,
      fragmentShader: rimFrag,
      ...premultiplied,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uGlowColor: { value: C.routeDark },
        uShadowColor: { value: C.fgLight },
        uGlow: { value: 1 },
        uOpacity: { value: 0 },
      },
    });
    this.rim = new Mesh(new SphereGeometry(1.14, 48, 32), rimMat);
    this.scene.add(this.rim); // not rotated: the rim looks the same from every angle

    // land dots
    const ll = high ? o.dots.high : o.dots.mid;
    const count = ll.length / 2;
    const pos = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const rnd = seeded(11);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = latLngToVec3(ll[i * 2]!, ll[i * 2 + 1]!, 1.004);
      pos.set([x, y, z], i * 3);
      rand[i] = rnd();
    }
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(pos, 3));
    dg.setAttribute('aFrom', new BufferAttribute(new Float32Array(count * 3), 3));
    dg.setAttribute('aFromColor', new BufferAttribute(new Float32Array(count * 3), 3));
    dg.setAttribute('aRand', new BufferAttribute(rand, 1));
    this.dots = new Points(
      dg,
      new ShaderMaterial({
        vertexShader: dotsVert,
        fragmentShader: dotsFrag,
        ...premultiplied,
        depthWrite: false,
        uniforms: {
          uForm: { value: 0 },
          uSize: { value: high ? 2.4 : 2.8 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uDotDark: { value: C.dotDark },
          uDotLight: { value: C.dotLight },
          uGlow: { value: 1 },
          uOpacity: { value: 1 },
        },
      }),
    );
    this.dots.frustumCulled = false;
    this.group.add(this.dots);

    // nodes and packets share the glow sprite shader
    const glowMat = () =>
      new ShaderMaterial({
        vertexShader: glowVert,
        fragmentShader: glowFrag,
        ...premultiplied,
        depthWrite: false,
        uniforms: {
          uPixelRatio: { value: renderer.getPixelRatio() },
          uOpacity: { value: 0 },
          uGlow: { value: 1 },
          uHalo: { value: high ? 1 : 0 },
        },
      });
    this.nodes = new Points(new BufferGeometry(), glowMat());
    this.packets = new Points(new BufferGeometry(), glowMat());
    this.arcs = new LineSegments(
      new BufferGeometry(),
      new ShaderMaterial({
        vertexShader: arcsVert,
        fragmentShader: arcsFrag,
        ...premultiplied,
        depthWrite: false,
        uniforms: {
          uActive: { value: -1 },
          uHover: { value: -1 },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uColor: { value: C.routeDark },
          uGlow: { value: 1 },
        },
      }),
    );
    for (const p of [this.nodes, this.packets, this.arcs]) {
      p.frustumCulled = false;
      this.group.add(p);
    }
    this.setNodes([{ id: HOME.id, kind: 'home', title: HOME.label, lat: HOME.lat, lng: HOME.lng }]);
    renderer.compile(this.scene, this.camera);
    o.canvas.dataset.globe = '';
    o.canvas.dataset.globeDots = String(count);
    o.handle.attach(this);
  }

  /* ---------------- data ---------------- */

  /** Home first, then the projects (GL-2, GL-3). */
  setNodes(nodes: GlobeNode[]) {
    this.nodeList = nodes;
    const n = nodes.length;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set(latLngToVec3(nodes[i]!.lat, nodes[i]!.lng, 1.012), i * 3);
    const g = this.nodes.geometry;
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aColor', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aAlpha', new BufferAttribute(new Float32Array(n).fill(1), 1));

    // routes: home ↔ each project (decision Q5)
    const home = nodes.find((x) => x.kind === 'home');
    this.routes = [];
    const segs: number[] = [];
    const routeAttr: number[] = [];
    const tAttr: number[] = [];
    nodes.forEach((node, i) => {
      if (!home || node.kind === 'home') return;
      const points = arcPoints(home, node, 48);
      const r = this.routes.length;
      this.routes.push({ nodeIndex: i, points });
      for (let k = 0; k < points.length - 1; k++) {
        segs.push(...points[k]!, ...points[k + 1]!);
        routeAttr.push(r, r);
        tAttr.push(k / (points.length - 1), (k + 1) / (points.length - 1));
      }
    });
    const ag = this.arcs.geometry;
    ag.setAttribute('position', new BufferAttribute(new Float32Array(segs), 3));
    ag.setAttribute('aRoute', new BufferAttribute(new Float32Array(routeAttr), 1));
    ag.setAttribute('aT', new BufferAttribute(new Float32Array(tAttr), 1));

    const pc = this.routes.length * this.packetsPerRoute;
    const pg = this.packets.geometry;
    pg.setAttribute('position', new BufferAttribute(new Float32Array(Math.max(1, pc) * 3), 3));
    pg.setAttribute('aSize', new BufferAttribute(new Float32Array(Math.max(1, pc)), 1));
    pg.setAttribute('aColor', new BufferAttribute(new Float32Array(Math.max(1, pc) * 3), 3));
    pg.setAttribute('aAlpha', new BufferAttribute(new Float32Array(Math.max(1, pc)), 1));
    pg.setDrawRange(0, pc);
    this.o.canvas.dataset.globeNodes = String(n);
    this.o.canvas.dataset.globeRoutes = String(this.routes.length);
    this.focus(this.focusId);
  }

  /* ---------------- GlobeApi ---------------- */

  focus(id: string | null) {
    this.focusId = id;
    const node = id ? this.nodeList.find((n) => n.id === id) : undefined;
    this.rig.focus(node ?? null);
    this.o.canvas.dataset.globeFocus = node?.id ?? '';
  }

  hover(id: string | null) {
    this.hoverId = id;
    this.o.canvas.dataset.globeHover = id ?? '';
  }

  pick(x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = 18;
    for (const [id, s] of this.screen) {
      if (!s.visible) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  drag(dx: number, dy: number) {
    const now = performance.now();
    const dt = this.dragAt ? Math.min(0.1, (now - this.dragAt) / 1000) : 1 / 60;
    this.dragAt = now;
    this.rig.drag(dx, dy, dt);
  }

  release() {
    this.dragAt = 0;
    this.rig.release();
  }

  screenOf(id: string): ScreenPoint | null {
    return this.screen.get(id) ?? null;
  }

  /* ---------------- frame ---------------- */

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** Puts the globe's centre and size where the slot is (camera view offset). */
  private place(): DOMRect {
    const r = this.o.slot.getBoundingClientRect();
    const W = this.width;
    const H = this.height;
    const radius = Math.max(40, Math.min(r.width, r.height) * 0.42);
    const k = H / 2 / (Math.tan((FOV * Math.PI) / 360) * radius);
    const d = Math.sqrt(1 + k * k);
    this.camera.aspect = W / H;
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, 0, 0);
    this.camera.setViewOffset(W, H, W / 2 - (r.left + r.width / 2), H / 2 - (r.top + r.height / 2), W, H);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    return r;
  }

  /** Where each dot starts its flight: the hero cloud, or a scatter if there isn't one (GL-6). */
  private seedFormation() {
    const g = this.dots.geometry;
    const from = g.getAttribute('aFrom') as BufferAttribute;
    const fromColor = g.getAttribute('aFromColor') as BufferAttribute;
    const count = from.count;
    const cloud = getHeroCloud();
    // the depth of the globe's centre on screen: dots start in that plane
    const centre = new Vector3(0, 0, 0).project(this.camera);
    const v = new Vector3();
    const rnd = seeded(5);
    const fallback = mixRgb(C.dotDark, C.accentDark, 0.3);
    for (let i = 0; i < count; i++) {
      let nx: number;
      let ny: number;
      let col: Vec3;
      if (cloud && cloud.count) {
        const j = (i * 7919) % cloud.count;
        nx = cloud.positions[j * 2]!;
        ny = cloud.positions[j * 2 + 1]!;
        col = [cloud.colors[j * 3]!, cloud.colors[j * 3 + 1]!, cloud.colors[j * 3 + 2]!];
      } else {
        nx = rnd() * 2.4 - 1.2;
        ny = rnd() * 1.6 - 1.2;
        col = fallback;
      }
      v.set(nx, ny, centre.z).unproject(this.camera);
      from.setXYZ(i, v.x, v.y, v.z);
      fromColor.setXYZ(i, col[0], col[1], col[2]);
    }
    from.needsUpdate = true;
    fromColor.needsUpdate = true;
  }

  frame(renderer: WebGLRenderer, info: FrameInfo): boolean {
    const H = info.height;
    const chapterTop = this.o.chapter.getBoundingClientRect().top;
    const f = formationProgress(chapterTop, H);
    setFormation(f);
    const r = this.place();
    const onScreen = r.bottom > -H * 0.1 && r.top < H * 1.1;
    if (f <= 0 || !onScreen) {
      if (this.formation > 0 && f <= 0) this.formation = 0;
      if (this.visible) {
        this.visible = false;
        this.screen.clear();
        this.o.handle.emitFrame();
      }
      this.o.canvas.dataset.globeForm = f.toFixed(2);
      return false;
    }
    if (this.formation <= 0) this.seedFormation(); // a fresh flight each time it forms
    this.formation = f;
    this.visible = true;

    const dt = Math.min(0.1, info.dt / 1000);
    const turning = this.rig.update(dt);
    this.group.rotation.set(this.rig.x, this.rig.y, 0);
    this.group.updateMatrixWorld();

    const g = info.glow;
    const solid = smooth(0.45, 0.95, f); // the sphere fades in as the dots arrive
    const extras = smooth(0.85, 1, f); // then nodes, routes and packets
    const bodyU = this.body.material.uniforms;
    bodyU.uGlow!.value = g;
    bodyU.uOpacity!.value = solid;
    this.body.material.depthWrite = solid > 0.98;
    const rimU = this.rim.material.uniforms;
    rimU.uGlow!.value = g;
    rimU.uOpacity!.value = solid;
    const dotU = this.dots.material.uniforms;
    dotU.uForm!.value = f;
    dotU.uGlow!.value = g;

    this.updateNodes(info, extras);
    this.updatePackets(info, extras);
    const arcU = this.arcs.material.uniforms;
    arcU.uGlow!.value = g;
    arcU.uOpacity!.value = extras;
    arcU.uTime!.value = info.time;
    arcU.uColor!.value = mixRgb(C.routeLight, C.routeDark, g);
    arcU.uActive!.value = this.routeIndexOf(this.focusId);
    arcU.uHover!.value = this.routeIndexOf(this.hoverId);

    renderer.render(this.scene, this.camera);
    this.updateScreen();
    this.o.handle.emitFrame();
    const c = this.o.canvas.dataset;
    c.globeForm = f.toFixed(2);
    c.globeRotY = this.rig.y.toFixed(3);
    c.globeRotX = this.rig.x.toFixed(3);
    // where the focused node is on screen (used by the automated tests)
    const fs = this.focusId ? this.screen.get(this.focusId) : undefined;
    c.globeFocusXy = fs && fs.visible ? `${Math.round(fs.x)},${Math.round(fs.y)}` : '';
    // packets keep flowing while the globe is on screen; it sleeps once it scrolls away
    return turning || extras > 0 || f < 1;
  }

  private routeIndexOf(id: string | null): number {
    if (!id) return -1;
    const i = this.nodeList.findIndex((n) => n.id === id);
    return this.routes.findIndex((r) => r.nodeIndex === i);
  }

  private updateNodes(info: FrameInfo, opacity: number) {
    const g = this.nodes.geometry;
    const size = g.getAttribute('aSize') as BufferAttribute;
    const color = g.getAttribute('aColor') as BufferAttribute;
    const accent = mixRgb(C.accentLight, C.accentDark, info.glow);
    const route = mixRgb(C.routeLight, C.routeDark, info.glow);
    const halo = info.glow * (this.o.tier === 'high' ? 1 : 0.35);
    this.nodeList.forEach((n, i) => {
      const on = n.id === this.focusId || n.id === this.hoverId;
      const pulse = n.kind === 'featured' || on ? 1 + 0.12 * Math.sin(info.time * 2.4 + i) : 1;
      const base = n.kind === 'home' ? 30 : n.kind === 'featured' ? 26 : 19;
      // with a halo the sprite is bigger than its core; without, keep the core the same size
      size.setX(i, base * (on ? 1.35 : 1) * pulse * (0.62 + 0.38 * halo) * 1.0);
      const c = n.kind === 'home' || on ? accent : route;
      color.setXYZ(i, c[0], c[1], c[2]);
    });
    size.needsUpdate = true;
    color.needsUpdate = true;
    const u = this.nodes.material.uniforms;
    u.uOpacity!.value = opacity;
    u.uGlow!.value = info.glow;
  }

  private updatePackets(info: FrameInfo, opacity: number) {
    const g = this.packets.geometry;
    const pos = g.getAttribute('position') as BufferAttribute;
    const size = g.getAttribute('aSize') as BufferAttribute;
    const color = g.getAttribute('aColor') as BufferAttribute;
    const alpha = g.getAttribute('aAlpha') as BufferAttribute;
    const glowCol = mixRgb(C.routeLight, C.accentDark, info.glow);
    let k = 0;
    this.routes.forEach((r, ri) => {
      const speed = 0.16 + (0.05 * ((ri * 37) % 5)) / 5;
      for (let j = 0; j < this.packetsPerRoute; j++) {
        let t = (info.time * speed + j / this.packetsPerRoute + ri * 0.137) % 1;
        if (ri % 2) t = 1 - t; // half the routes flow home, half flow out
        const p = alongArc(r.points, t);
        pos.setXYZ(k, p[0], p[1], p[2]);
        size.setX(k, this.o.tier === 'high' ? 16 : 10);
        color.setXYZ(k, glowCol[0], glowCol[1], glowCol[2]);
        alpha.setX(k, Math.sin(Math.PI * t));
        k++;
      }
    });
    for (const a of [pos, size, color, alpha]) a.needsUpdate = true;
    const u = this.packets.material.uniforms;
    u.uOpacity!.value = opacity;
    u.uGlow!.value = info.glow;
  }

  /** Screen positions of the nodes, for picking and labels. */
  private updateScreen() {
    const v = new Vector3();
    const camDir = new Vector3();
    this.screen.clear();
    const pos = this.nodes.geometry.getAttribute('position') as BufferAttribute;
    this.nodeList.forEach((n, i) => {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(this.group.matrixWorld);
      camDir.copy(this.camera.position).sub(v);
      const visible = v.clone().normalize().dot(camDir.normalize()) > 0.15;
      v.project(this.camera);
      this.screen.set(n.id, {
        x: ((v.x + 1) / 2) * this.width,
        y: ((1 - v.y) / 2) * this.height,
        visible,
      });
    });
  }

  dispose() {
    this.o.handle.detach(this);
    setFormation(0);
    for (const m of [this.body, this.rim, this.dots, this.nodes, this.packets, this.arcs]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    const c = this.o.canvas.dataset;
    for (const k of [
      'globe',
      'globeDots',
      'globeNodes',
      'globeRoutes',
      'globeFocus',
      'globeHover',
      'globeForm',
      'globeRotY',
      'globeRotX',
      'globeFocusXy',
    ])
      delete c[k];
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
