/**
 * The film slate's header (spec 07 CT-4): a clapper bar over SCENE · TAKE · date. The bar is
 * open while you write and snaps shut when the message is sent. Decorative: screen readers
 * get the form and its status instead.
 */
import styles from './contact.module.css';

const two = (n: number) => String(n).padStart(2, '0');

export function Slate({
  scene,
  take,
  date,
  closed,
}: {
  scene: number;
  take: number;
  date: string;
  closed: boolean;
}) {
  return (
    <div className={styles.slateHead} aria-hidden data-slate>
      <div className={styles.clapper}>
        <span className={styles.clapperBar} data-clapper data-closed={closed || undefined} />
        <span className={styles.clapperBase} />
      </div>
      <div className={`label ${styles.slateInfo}`}>
        <span>
          <span className={styles.slateKey}>Scene</span> {two(scene)}
        </span>
        <span data-take>
          <span className={styles.slateKey}>Take</span> {two(take)}
        </span>
        <span>{date}</span>
      </div>
    </div>
  );
}
