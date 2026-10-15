/**
 * "Place on globe" (spec 05 AD-1 – AD-3): click a flat world map, type latitude and
 * longitude, or pick a city; or leave it on automatic placement (stores null).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useController } from 'react-hook-form';
import { HOME, parseLandDots } from '../../scene/globe/geo';
import landDotsUrl from '../../scene/globe/data/land-dots.bin?url';
import { FieldShell } from '../ui/FieldShell';
import { Switch, ui } from '../ui/primitives';
import { useFieldError } from './basic';
import cities from './cities.json';
import styles from './fields.module.css';

interface City {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

const cityList = cities as City[];
const cityLabel = (c: City) => `${c.name}, ${c.country}`;

/** Finds a city by "Name, CC" or by name alone (case-insensitive). */
export function findCity(query: string, list: City[] = cityList): City | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return list.find((c) => cityLabel(c).toLowerCase() === q) ?? list.find((c) => c.name.toLowerCase() === q);
}

/** Map pixel ↔ lat/lng on an equirectangular map w × h. */
export const mapToLatLng = (x: number, y: number, w: number, h: number) => ({
  lat: Math.round((90 - (y / h) * 180) * 100) / 100,
  lng: Math.round(((x / w) * 360 - 180) * 100) / 100,
});
const latLngToMap = (lat: number, lng: number, w: number, h: number) => ({
  x: ((lng + 180) / 360) * w,
  y: ((90 - lat) / 180) * h,
});

const MAP_W = 720;
const MAP_H = 360;

/** Draws the land dots once, in the admin's theme colours. */
function useLandMap(canvas: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    let cancelled = false;
    fetch(landDotsUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const c = canvas.current;
        const ctx = c?.getContext('2d');
        if (cancelled || !c || !ctx) return;
        const { mid } = parseLandDots(buf);
        ctx.clearRect(0, 0, MAP_W, MAP_H);
        ctx.fillStyle = getComputedStyle(c).color;
        for (let i = 0; i < mid.length; i += 2) {
          const { x, y } = latLngToMap(mid[i]!, mid[i + 1]!, MAP_W, MAP_H);
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      })
      .catch(() => {
        /* the map is a convenience; lat/lng and the city search still work */
      });
    return () => {
      cancelled = true;
    };
  }, [canvas]);
}

export function GlobeField({ name, label }: { name: string; label: string }) {
  const { field } = useController({ name });
  const e1 = useFieldError(name);
  const e2 = useFieldError(`${name}.lat`);
  const e3 = useFieldError(`${name}.lng`);
  const error = e1 ?? e2 ?? e3;
  const value = field.value as { lat: number; lng: number } | null;
  const auto = value == null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listId = useId();
  const [city, setCity] = useState('');
  useLandMap(canvasRef);

  const set = (lat: number, lng: number) =>
    field.onChange({ lat: Math.max(-90, Math.min(90, lat)), lng: Math.max(-180, Math.min(180, lng)) });

  const update = (key: 'lat' | 'lng', raw: string) => {
    const n = raw === '' ? NaN : Number(raw);
    const base = value ?? { lat: HOME.lat, lng: HOME.lng };
    field.onChange({ ...base, [key]: Number.isNaN(n) ? 0 : n });
  };

  const marker = value ? latLngToMap(value.lat, value.lng, 100, 100) : null;
  const home = latLngToMap(HOME.lat, HOME.lng, 100, 100);

  return (
    <FieldShell label={label} error={error} help="Where this project sits on the 3D globe." group>
      {() => (
        <div className={styles.globe}>
          <Switch
            checked={auto}
            onChange={(v) => field.onChange(v ? null : { lat: HOME.lat, lng: HOME.lng })}
            label="Place automatically"
          />
          <div className={styles.globeMap} data-auto={auto || undefined}>
            <canvas
              ref={canvasRef}
              width={MAP_W}
              height={MAP_H}
              className={styles.globeCanvas}
              role="img"
              aria-label="World map: click to place the project. You can also type a city or the latitude and longitude below."
              data-globe-map
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const p = mapToLatLng(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
                set(p.lat, p.lng);
              }}
            />
            <span
              className={styles.globeHome}
              style={{ left: `${home.x}%`, top: `${home.y}%` }}
              title="Home · Bhubaneswar"
              aria-hidden
            />
            {marker && (
              <span
                className={styles.globeMarker}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                aria-hidden
                data-globe-marker
              />
            )}
          </div>
          <div className={styles.twoCol}>
            <label className={ui.field}>
              <span className={ui.label}>Find a city</span>
              <input
                className={ui.input}
                list={listId}
                value={city}
                placeholder="e.g. Bengaluru"
                onChange={(e) => {
                  setCity(e.target.value);
                  const c = findCity(e.target.value);
                  if (c) set(c.lat, c.lng);
                }}
              />
              <datalist id={listId}>
                {cityList.map((c) => (
                  <option key={cityLabel(c)} value={cityLabel(c)} />
                ))}
              </datalist>
            </label>
            <div className={styles.globePresets}>
              <button
                type="button"
                className={styles.globePreset}
                onClick={() => {
                  setCity('');
                  set(HOME.lat, HOME.lng);
                }}
              >
                Home (Bhubaneswar)
              </button>
            </div>
          </div>
          {!auto && (
            <div className={styles.twoCol}>
              <label className={ui.field}>
                <span className={ui.label}>Latitude (−90 to 90)</span>
                <input
                  className={ui.input}
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={value.lat}
                  onChange={(e) => update('lat', e.target.value)}
                />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Longitude (−180 to 180)</span>
                <input
                  className={ui.input}
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={value.lng}
                  onChange={(e) => update('lng', e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </FieldShell>
  );
}
