/**
 * Dev-only token preview (/dev/tokens) — master spec Part 0 task 0.6.
 * Shows every colour, type size and motion token in both themes, side by side.
 */
import { useState } from 'react';
import { AA, contrastRatio } from '../theme/contrast';
import { kebab } from '../theme/css';
import { fontRoles, fonts } from '../theme/fonts';
import {
  duration,
  easing,
  fontSize,
  fontWeight,
  radius,
  space,
  themeNames,
  themes,
  type ThemeName,
  type ThemeTokens,
} from '../theme/tokens';
import styles from './TokenPreview.module.css';

/** Which background each colour is checked against, and the AA threshold it must pass. */
const colourChecks: Partial<
  Record<keyof ThemeTokens['color'], { on: keyof ThemeTokens['color']; min: number }>
> = {
  fg: { on: 'bg', min: AA.text },
  fgMuted: { on: 'bg', min: AA.text },
  accent: { on: 'bg', min: AA.ui },
  accentText: { on: 'bg', min: AA.text },
  onAccent: { on: 'accent', min: AA.text },
  accent2: { on: 'bg', min: AA.ui },
  accent2Text: { on: 'bg', min: AA.text },
  danger: { on: 'bg', min: AA.text },
  success: { on: 'bg', min: AA.text },
};

function ThemePanel({ name }: { name: ThemeName }) {
  const t = themes[name];
  const [playing, setPlaying] = useState(false);

  return (
    <section data-theme={name} className={styles.panel} aria-labelledby={`theme-${name}`}>
      <header className={styles.panelHead}>
        <p className="label">{name === 'dark' ? 'Night Screening' : 'Daylight Edit'}</p>
        <h2 id={`theme-${name}`} className={styles.h2}>
          {name} theme
        </h2>
      </header>

      <h3 className={styles.h3}>Colour</h3>
      <ul className={styles.swatches}>
        {Object.entries(t.color).map(([key, value]) => {
          const check = colourChecks[key as keyof ThemeTokens['color']];
          const ratio = check ? contrastRatio(value, t.color[check.on]) : null;
          const pass = check && ratio !== null ? ratio >= check.min : null;
          return (
            <li key={key} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--color-${kebab(key)})` }} />
              <span>
                <code className="label">{kebab(key)}</code>
                <br />
                <span className={styles.muted}>{value}</span>
                {ratio !== null && check && (
                  <span className={pass ? styles.pass : styles.fail}>
                    {' '}
                    · {ratio.toFixed(2)}:1 on {kebab(check.on)} {pass ? '✓' : '✗'}
                  </span>
                )}
              </span>
            </li>
          );
        })}
        <li className={styles.swatch}>
          <span className={styles.chip}>
            <span className={styles.grain} />
          </span>
          <span>
            <code className="label">grain-opacity</code>
            <br />
            <span className={styles.muted}>{t.effect.grainOpacity}</span>
          </span>
        </li>
        <li className={styles.swatch}>
          <span className={styles.chip} />
          <span>
            <code className="label">globe-glow</code>
            <br />
            <span className={styles.muted}>{t.effect.globeGlow ? 'on (bloom)' : 'off (soft shadow)'}</span>
          </span>
        </li>
      </ul>

      <h3 className={styles.h3}>Type</h3>
      <div className={styles.stack}>
        {fontRoles.map((role) => (
          <p key={role} className={styles.muted}>
            <code className="label">--font-{role}</code> {fonts[role].family}
          </p>
        ))}
        {Object.entries(fontSize)
          .slice()
          .reverse()
          .map(([key, [min, max]]) => (
            <div key={key} className={styles.typeRow}>
              <code className="label">
                {key} · {min === max ? `${min}px` : `${min}→${max}px`}
              </code>
              <p className={styles.italic} style={{ fontSize: `var(--font-size-${key})` }}>
                Ausaf Hussain
              </p>
            </div>
          ))}
        {Object.entries(fontWeight).map(([key, w]) => (
          <p key={key} style={{ fontWeight: `var(--font-weight-${key})` }}>
            Inter {key} {w} — The quick brown fox ships the pipeline.
          </p>
        ))}
        <p className="label">Data label · Azure · .NET · 00:01:24:12</p>
        <p>
          Body text with a <a href="#main">link</a> and <em className={styles.italic}>Garamond emphasis</em>.
        </p>
        <button type="button" className={styles.button}>
          Primary action
        </button>
      </div>

      <h3 className={styles.h3}>Space &amp; radius</h3>
      <div className={styles.stack}>
        {Object.entries(space).map(([key, px]) => (
          <div key={key} className={styles.spaceRow}>
            <code className="label">space-{key}</code>
            <span className={styles.bar} style={{ width: `var(--space-${key})` }} />
            <span className={styles.muted}>{px}px</span>
          </div>
        ))}
        <div className={styles.radii}>
          {Object.keys(radius).map((key) => (
            <span key={key} className={styles.radius} style={{ borderRadius: `var(--radius-${key})` }}>
              <code className="label">{key}</code>
            </span>
          ))}
        </div>
      </div>

      <h3 className={styles.h3}>Motion</h3>
      <button type="button" className={styles.button} onClick={() => setPlaying((p) => !p)}>
        {playing ? 'Reset' : 'Play'} easings
      </button>
      <div className={styles.stack}>
        {Object.keys(easing).map((key) => (
          <div key={key} className={styles.track}>
            <code className="label">ease-{kebab(key)} · scene</code>
            <span
              className={styles.dot}
              data-playing={playing}
              style={{ transitionTimingFunction: `var(--ease-${kebab(key)})` }}
            />
          </div>
        ))}
        <p className={styles.muted}>
          Durations:{' '}
          {Object.entries(duration)
            .map(([k, ms]) => `${k} ${ms}ms`)
            .join(' · ')}
        </p>
      </div>
    </section>
  );
}

export function TokenPreview() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <p className="label">Dev only · /dev/tokens</p>
        <h1 className={styles.h1}>Design tokens</h1>
        <p className={styles.muted}>
          Source: <code>src/theme/tokens.ts</code> and <code>src/theme/fonts.ts</code>
        </p>
      </header>
      <div className={styles.grid}>
        {themeNames.map((name) => (
          <ThemePanel key={name} name={name} />
        ))}
      </div>
    </div>
  );
}
