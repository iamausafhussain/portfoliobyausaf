/**
 * The tiny script inlined in <head> that picks the theme before the first paint
 * (master spec TH-1, TH-3; spec 03 TS-1). Built from tokens at build time by the
 * design-system Vite plugin, so colours never get out of sync.
 */
import { defaultTheme, themes, type ThemeName } from './tokens';

export const THEME_STORAGE_KEY = 'theme';
export const LITE_STORAGE_KEY = 'lite';

/** Theme-colour for the phone browser bar (TS-6). */
export const themeColor = (t: ThemeName) => themes[t].color.bg;

export function buildThemeScript(): string {
  const other: ThemeName = defaultTheme === 'dark' ? 'light' : 'dark';
  // Kept small and ES5-safe: it runs before anything else on the page.
  return `(function(){var d=document.documentElement,t,s='os',l;try{t=localStorage.getItem('${THEME_STORAGE_KEY}');l=localStorage.getItem('${LITE_STORAGE_KEY}')}catch(e){}if(t==='dark'||t==='light'){s='user'}else{t=window.matchMedia&&matchMedia('(prefers-color-scheme: ${other})').matches?'${other}':'${defaultTheme}'}d.setAttribute('data-theme',t);d.setAttribute('data-theme-source',s);if(l==='1')d.setAttribute('data-tier','low');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'${themeColor('light')}':'${themeColor('dark')}')})();`;
}
