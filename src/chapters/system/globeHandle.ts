/**
 * The link between The System chapter (DOM, main bundle) and the globe layer (lazy 3D
 * chunk). The chapter talks to the handle whether or not the globe has loaded; the globe
 * attaches when it's ready and picks up the current focus and hover.
 */

export type NodeKind = 'home' | 'project' | 'featured';

export interface GlobeNode {
  id: string;
  kind: NodeKind;
  title: string;
  lat: number;
  lng: number;
}

/** A project as the globe needs it (positions are worked out by the globe). */
export interface GlobeItem {
  id: string;
  title: string;
  featured: boolean;
  globe: { lat: number; lng: number } | null;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** on the side of the globe facing the visitor */
  visible: boolean;
}

export interface GlobeApi {
  /** Turn to this node (tour stop or keyboard focus); null = idle spin. */
  focus(id: string | null): void;
  /** Light this node and its route (pointer over a node or its card). */
  hover(id: string | null): void;
  /** The node under a viewport point, if any. */
  pick(x: number, y: number): string | null;
  /** Rotate by a pointer movement in px; release() lets it coast. */
  drag(dx: number, dy: number): void;
  release(): void;
  screenOf(id: string): ScreenPoint | null;
}

export class GlobeHandle {
  private api: GlobeApi | null = null;
  private focusId: string | null = null;
  private hoverId: string | null = null;
  private frameListeners = new Set<() => void>();

  get ready(): boolean {
    return !!this.api;
  }

  attach(api: GlobeApi) {
    this.api = api;
    api.focus(this.focusId);
    api.hover(this.hoverId);
  }

  detach(api: GlobeApi) {
    if (this.api === api) this.api = null;
  }

  focus(id: string | null) {
    this.focusId = id;
    this.api?.focus(id);
  }

  hover(id: string | null) {
    this.hoverId = id;
    this.api?.hover(id);
  }

  pick(x: number, y: number): string | null {
    return this.api?.pick(x, y) ?? null;
  }

  drag(dx: number, dy: number) {
    this.api?.drag(dx, dy);
  }

  release() {
    this.api?.release();
  }

  screenOf(id: string): ScreenPoint | null {
    return this.api?.screenOf(id) ?? null;
  }

  /** Called by the globe after each drawn frame (labels follow their nodes). */
  onFrame(fn: () => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  emitFrame() {
    this.frameListeners.forEach((fn) => fn());
  }
}
