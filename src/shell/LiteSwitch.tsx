/** Visitor-facing Lite mode switch (spec 03 DT-3). */
import { useId } from 'react';
import { useDeviceTier } from '../device/DeviceProvider';
import styles from './shell.module.css';

export function LiteSwitch() {
  const { lite, setLite } = useDeviceTier();
  const id = useId();
  return (
    <label className={styles.lite} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.liteInput}
        checked={lite}
        onChange={(e) => setLite(e.target.checked)}
      />
      <span className={styles.liteTrack} aria-hidden />
      <span>
        Lite mode <span className={styles.liteHint}>· fewer effects, faster on slow devices</span>
      </span>
    </label>
  );
}
