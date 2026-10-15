// Footage → particles (spec 04 PT-1). `position.xy` is the particle's place in the picture
// (hero pixels, y down); uProgress (0–1, from scroll) carries it into a loose cloud.
attribute vec3 aColor;
attribute vec4 aRand;

uniform float uProgress;
uniform float uScroll;      // px the hero has scrolled up by
uniform float uTime;        // seconds, for the gentle drift inside the cloud
uniform float uGlow;        // 1 = dark theme (glow), 0 = light theme (ink)
uniform float uSpacing;     // grid spacing in px: particles cover the picture at progress 0
uniform float uPixelRatio;
uniform vec2 uViewport;     // css px
uniform vec2 uHero;         // hero size in css px
uniform vec3 uTintGlow;
uniform vec3 uTintInk;
uniform vec3 uBgDark;
uniform vec3 uBgLight;

varying vec3 vColor;
varying float vE;

float easeInOut(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

void main() {
  // stagger: higher rows and random particles peel off first
  float delay = aRand.x * 0.32 + (position.y / uHero.y) * 0.12;
  float e = easeInOut(clamp((uProgress - delay) / 0.52, 0.0, 1.0));

  vec2 anchored = vec2(position.x, position.y - uScroll);
  // must match cloudPoint() in sampling.ts
  float ca = aRand.y * 6.2831853;
  float cr = sqrt(aRand.z);
  vec2 cloud = vec2(uViewport.x * (0.5 + cos(ca) * cr * 0.46), uViewport.y * (0.66 + sin(ca) * cr * 0.24));

  vec2 p = mix(anchored, cloud, e);
  float arc = sin(e * 3.14159265);
  p.y -= arc * (30.0 + aRand.w * 110.0);           // lift off before drifting down
  p.x += arc * (aRand.z - 0.5) * 180.0;            // scatter sideways on the way
  p += e * vec2(sin(uTime * 0.6 + aRand.x * 6.2832), cos(uTime * 0.5 + aRand.y * 6.2832)) * (3.0 + aRand.w * 9.0);

  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);

  float cloudSize = mix(1.5, 2.6, uGlow) * (0.6 + aRand.w * 0.9);
  gl_PointSize = mix(uSpacing * 1.3, cloudSize, e) * uPixelRatio;

  // dark: footage colours tinted towards the accent and brightened; light: dark ink
  vec3 glowCol = mix(aColor, uTintGlow, 0.3) * 1.35;
  vec3 inkCol = mix(aColor * 0.45, uTintInk, 0.55);
  vColor = mix(aColor, mix(inkCol, glowCol, uGlow), clamp(e * 1.4, 0.0, 1.0));

  // while it's still a picture, carry the same scrim as the footage (hero.module.css .scrim)
  // so the title stays readable as the footage dissolves
  float yn = position.y / uHero.y;
  float scrim = yn > 0.54 ? mix(0.88, 1.0, (yn - 0.54) / 0.46)
              : yn > 0.28 ? mix(0.3, 0.88, (yn - 0.28) / 0.26)
              : mix(0.5, 0.3, yn / 0.28);
  vColor = mix(vColor, mix(uBgLight, uBgDark, uGlow), scrim * (1.0 - smoothstep(0.0, 0.6, e)));
  vE = e;
}
