/**
 * Keeps a failure in the optional 3D layer (a chunk that didn't download, a WebGL error
 * during render) from taking the page down: it reports the failure and renders nothing,
 * so the hero falls back to the plain fade (spec 04 PT-6).
 */
import { Component, type ReactNode } from 'react';

export class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn('[hero particles] not loaded:', error);
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
