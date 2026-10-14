/**
 * A container for the cursor on the browser's top layer, so it also shows above modal
 * dialogs (the Chapters menu), which sit above every z-index. Built on the Popover API:
 * the top layer stacks in the order things open, so whenever a dialog opens the
 * container is re-shown to stay on top. Without the Popover API it's a plain fixed layer.
 */
import { useEffect, useState } from 'react';

export function useTopLayer(className: string, enabled: boolean): HTMLElement | null {
  // one container per provider; it's only in the page while the cursor is enabled
  const [el] = useState(() => {
    const div = document.createElement('div');
    div.setAttribute('aria-hidden', 'true');
    div.dataset.cursorLayer = '';
    return div;
  });

  useEffect(() => {
    if (!enabled) return;
    el.setAttribute('class', className);
    const popover = typeof el.showPopover === 'function';
    if (popover) el.setAttribute('popover', 'manual');
    document.body.appendChild(el);

    const raise = () => {
      if (!popover || !el.isConnected) return;
      try {
        if (el.matches(':popover-open')) el.hidePopover();
        el.showPopover();
      } catch {
        /* not allowed right now: stays where it is */
      }
    };
    raise();
    // a dialog opened (or a popover was shown): go back on top of it
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.target !== el && (r.target as Element).hasAttribute?.('open'))) raise();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    // another popover opened (our own show/hide fires toggle too: ignore those)
    const onToggle = (e: Event) => {
      if (e.target !== el && (e as ToggleEvent).newState === 'open') raise();
    };
    document.addEventListener('toggle', onToggle, true);

    return () => {
      mo.disconnect();
      document.removeEventListener('toggle', onToggle, true);
      if (popover && el.matches(':popover-open')) el.hidePopover();
      el.remove();
    };
  }, [className, enabled, el]);

  return enabled ? el : null;
}
