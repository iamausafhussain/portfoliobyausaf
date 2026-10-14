/** Asks before leaving a form with unsaved changes (spec 02 AD-23). */
import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { useConfirm } from '../ui/feedback';

/**
 * Returns `allowNextNavigation()` for navigations the page triggers itself right after
 * saving or deleting, before React has re-rendered with the clean state.
 */
export function useUnsavedChanges(dirty: boolean): { allowNextNavigation: () => void } {
  const confirm = useConfirm();
  const skip = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skip.current) {
      skip.current = false;
      return false;
    }
    return dirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void confirm({
      title: 'Leave without saving?',
      body: 'Your changes on this page will be lost.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      danger: true,
    }).then((leave) => {
      if (!active) return;
      if (leave) blocker.proceed?.();
      else blocker.reset?.();
    });
    return () => {
      active = false;
    };
  }, [blocker, confirm]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const allowNextNavigation = useCallback(() => {
    skip.current = true;
  }, []);
  return { allowNextNavigation };
}
