/**
 * The hero's particle field (spec 04 PT-1 – PT-3): one Three.js `Points` object drawn
 * with a small custom shader. Knows nothing about React or scrolling; the caller sets
 * progress, scroll and theme and asks it to render.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { themes } from '../../theme/tokens';
import fragmentShader from './particles.frag?raw';
import vertexShader from './particles.vert?raw';
import { coverCrop, framePixelsToParticles, gridFor, toRgb, type Particles } from './sampling';

export type FrameSource = HTMLVideoElement | HTMLImageElement;

const sourceSize = (s: FrameSource) =>
  s instanceof HTMLVideoElement ? [s.videoWidth, s.videoHeight] : [s.naturalWidth, s.naturalHeight];

/** Can this element's current frame be drawn yet? */
export function frameReady(s: FrameSource | null): s is FrameSource {
  if (!s) return false;
  if (s instanceof HTMLVideoElement) return s.readyState >= 2 && s.videoWidth > 0;
  return s.complete && s.naturalWidth > 0;
}

export class ParticleField {
  readonly maxCount: number;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new Camera();
  private geometry = new BufferGeometry();
  private material: ShaderMaterial;
  private sampler = document.createElement('canvas');
  private particles: Particles | null = null;
  private position: BufferAttribute;
  private color: BufferAttribute;
  private rand: BufferAttribute;

  constructor(canvas: HTMLCanvasElement, maxCount: number, pixelRatio: number) {
    this.maxCount = maxCount;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(0x000000, 0);

    this.position = new BufferAttribute(new Float32Array(maxCount * 3), 3);
    this.color = new BufferAttribute(new Float32Array(maxCount * 3), 3);
    this.rand = new BufferAttribute(new Float32Array(maxCount * 4), 4);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('aColor', this.color);
    this.geometry.setAttribute('aRand', this.rand);
    this.geometry.setDrawRange(0, 0);

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        uProgress: { value: 0 },
        uScroll: { value: 0 },
        uTime: { value: 0 },
        uGlow: { value: 1 },
        uAlpha: { value: 0 },
        uSpacing: { value: 4 },
        uPixelRatio: { value: pixelRatio },
        uViewport: { value: [1, 1] },
        uHero: { value: [1, 1] },
        uTintGlow: { value: toRgb(themes.dark.color.accent) },
        uTintInk: { value: toRgb(themes.light.color.accent2Text) },
        uBgDark: { value: toRgb(themes.dark.color.bg) },
        uBgLight: { value: toRgb(themes.light.color.bg) },
      },
    });
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);
    // compile now, so the first scroll doesn't stutter
    this.renderer.compile(this.scene, this.camera);
  }

  get count(): number {
    return this.particles?.count ?? 0;
  }

  /** The particles' data, for the hand-off to Part 5. */
  get data(): Particles | null {
    return this.particles;
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.material.uniforms.uViewport!.value = [width, height];
  }

  /**
   * Samples the current frame of `source`, laid out like `object-fit: cover` over a
   * heroW × heroH box. Throws if the frame can't be read (cross-origin video).
   */
  sample(source: FrameSource, heroW: number, heroH: number, seed = 7) {
    const { cols, rows } = gridFor(this.maxCount, heroW, heroH);
    const [sw0, sh0] = sourceSize(source);
    const crop = coverCrop(sw0!, sh0!, heroW, heroH);
    this.sampler.width = cols;
    this.sampler.height = rows;
    const ctx = this.sampler.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);
    const pixels = ctx.getImageData(0, 0, cols, rows).data; // SecurityError when tainted
    this.particles = framePixelsToParticles(
      pixels,
      cols,
      rows,
      heroW,
      heroH,
      seed,
      this.particles ?? undefined,
    );

    const p = this.particles;
    const pos = this.position.array as Float32Array;
    for (let i = 0; i < p.count; i++) {
      pos[i * 3] = p.start[i * 2]!;
      pos[i * 3 + 1] = p.start[i * 2 + 1]!;
      pos[i * 3 + 2] = 0;
    }
    (this.color.array as Float32Array).set(p.color.subarray(0, p.count * 3));
    (this.rand.array as Float32Array).set(p.rand.subarray(0, p.count * 4));
    for (const a of [this.position, this.color, this.rand]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, p.count * a.itemSize);
      a.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, p.count);
    this.material.uniforms.uSpacing!.value = p.spacing;
    this.material.uniforms.uHero!.value = [heroW, heroH];
  }

  set(values: { progress?: number; scroll?: number; time?: number; glow?: number; alpha?: number }) {
    const u = this.material.uniforms;
    if (values.progress !== undefined) u.uProgress!.value = values.progress;
    if (values.scroll !== undefined) u.uScroll!.value = values.scroll;
    if (values.time !== undefined) u.uTime!.value = values.time;
    if (values.glow !== undefined) u.uGlow!.value = values.glow;
    if (values.alpha !== undefined) u.uAlpha!.value = values.alpha;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
