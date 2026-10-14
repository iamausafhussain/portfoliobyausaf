/** The dot and the viewfinder ring (spec 04 CU-2). Moved by cursorEngine, not React. */
import { useEffect, useRef } from 'react';
import { startCursor } from './cursorEngine';
import styles from './cursor.module.css';

export function Cursor() {
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const c0 = useRef<HTMLSpanElement>(null);
  const c1 = useRef<HTMLSpanElement>(null);
  const c2 = useRef<HTMLSpanElement>(null);
  const c3 = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (
      !root.current ||
      !dot.current ||
      !c0.current ||
      !c1.current ||
      !c2.current ||
      !c3.current ||
      !label.current
    )
      return;
    return startCursor({
      root: root.current,
      dot: dot.current,
      corners: [c0.current, c1.current, c2.current, c3.current],
      label: label.current,
    });
  }, []);

  return (
    <div ref={root} className={styles.root} aria-hidden data-custom-cursor>
      <span ref={c0} className={`${styles.corner} ${styles.tl}`} />
      <span ref={c1} className={`${styles.corner} ${styles.tr}`} />
      <span ref={c2} className={`${styles.corner} ${styles.br}`} />
      <span ref={c3} className={`${styles.corner} ${styles.bl}`} />
      <span ref={label} className={styles.label} />
      <span ref={dot} className={styles.dot} />
    </div>
  );
}
