/**
 * The form's draft, kept for this browser tab so a reload doesn't lose it (spec 07 CT-8).
 * Session storage only: it's gone when the tab closes, and cleared after sending.
 */
import { useCallback, useEffect, useState } from 'react';
import { emptyDraft, isEmpty, parseDraft, type Draft } from './contactForm';

export const DRAFT_KEY = 'contact-draft';

function read(): Draft {
  try {
    return parseDraft(sessionStorage.getItem(DRAFT_KEY)) ?? emptyDraft();
  } catch {
    return emptyDraft();
  }
}

export function useContactDraft() {
  const [draft, setDraft] = useState<Draft>(read);

  useEffect(() => {
    try {
      if (isEmpty(draft)) sessionStorage.removeItem(DRAFT_KEY);
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage blocked: the draft just isn't kept */
    }
  }, [draft]);

  const clear = useCallback(() => setDraft(emptyDraft()), []);
  return [draft, setDraft, clear] as const;
}
