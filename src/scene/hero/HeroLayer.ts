/**
 * The hero particles as a layer on the shared stage (spec 04 PT-1 – PT-6, spec 05 ST-3).
 *  - samples the footage when the visitor starts scrolling (and again after returning to the top)
 *  - scrubs the scatter with scroll; scrolling back re-forms the picture
 *  - leaves a quiet cloud behind About, which hands over to the globe as it forms
 */
import type { WebGLRenderer } from 'three';
import type { StageMedia } from '../../chapters/hero/HeroVideo';
import { heroProgress } from '../../chapters/hero/heroMedia';
import type { FrameInfo, StageLayer } from '../stage/Stage';
import { getFormation, publishHeroCloud } from './handoff';
import { frameReady, ParticleField, type FrameSource } from './ParticleField';
import { layerAlpha } from './sampling';

export interface HeroLayerOptions {
  canvas: HTMLCanvasElement;
  hero: HTMLElement;
  media: StageMedia;
  maxCount: number;
  pixelRatio: number;
  /** a frame was there but couldn't be read (cross-origin): the hero falls back to the fade */
  onFail: (reason: string) => void;
  /** after a heavy one-off upload, so the frame guard ignores the next frames */
  onSampled: () => void;
}

export class HeroLayer implements StageLayer {
  private field: ParticleField;
  private sampled = false;
  private failed = false;

  private readonly opts: HeroLayerOptions;

  constructor(renderer: WebGLRenderer, opts: HeroLayerOptions) {
    this.opts = opts;
    this.field = new ParticleField(renderer, opts.maxCount, opts.pixelRatio);
    opts.canvas.dataset.heroParticles = '';
    opts.canvas.dataset.max = String(opts.maxCount);
  }

  resize(width: number, height: number) {
    this.field.setSize(width, height);
  }

  private trySample(): boolean {
    const m = this.opts.media;
    const candidates: (FrameSource | null)[] = m.clip?.readable ? [m.video, m.poster] : [m.poster];
    const rect = this.opts.hero.getBoundingClientRect();
    for (const src of candidates) {
      if (!frameReady(src)) continue;
      try {
        this.field.sample(src, rect.width, rect.height);
        this.opts.canvas.dataset.count = String(this.field.count);
        publishHeroCloud(this.field.data);
        this.opts.onSampled();
        return true;
      } catch {
        /* cross-origin frame: try the next source (spec 04 §3.3 step 5) */
      }
    }
    return false;
  }

  frame(renderer: WebGLRenderer, info: FrameInfo): boolean {
    if (this.failed) return false;
    const rect = this.opts.hero.getBoundingClientRect();
    const top = rect.top + info.scrollY;
    const p = heroProgress(info.scrollY, top, rect.height);

    if (p <= 0)
      this.sampled = false; // a fresh frame next time the visitor scrolls
    else if (!this.sampled) {
      this.sampled = this.trySample();
      const m = this.opts.media;
      // a frame was there but couldn't be read from any source: give up on particles
      if (!this.sampled && (frameReady(m.poster) || frameReady(m.video))) {
        this.failed = true;
        this.opts.onFail('the footage frame could not be read');
        return false;
      }
    }

    const alpha = this.sampled ? layerAlpha(p, getFormation()) : 0;
    const c = this.opts.canvas.dataset;
    c.progress = p.toFixed(3);
    if (alpha <= 0) return false;
    this.field.set({ progress: p, scroll: info.scrollY - top, time: info.time, glow: info.glow, alpha });
    this.field.render(renderer);
    return true; // the cloud drifts gently while it's visible
  }

  dispose() {
    this.field.dispose();
    const c = this.opts.canvas.dataset;
    delete c.heroParticles;
    delete c.max;
    delete c.count;
    delete c.progress;
    publishHeroCloud(null);
  }
}
