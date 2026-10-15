uniform float uGlow;
uniform float uHalo;       // 1 on high tier (the "bloom"), 0 on mid
varying vec3 vColor;
varying float vAlpha;
varying float vFacing;
void main() {
  float d = length(gl_PointCoord - 0.5);
  // core takes the inner ~30 % of the sprite; the halo fills the rest in the dark theme
  float core = 1.0 - smoothstep(0.12, 0.17, d);
  float halo = exp(-d * d * 18.0) * (1.0 - smoothstep(0.42, 0.5, d)) * uHalo * uGlow;
  // light theme: a crisp ring instead of a halo
  float ring = (smoothstep(0.24, 0.27, d) - smoothstep(0.30, 0.33, d)) * (1.0 - uGlow);
  float a = max(core, max(halo * 0.75, ring * 0.8)) * vAlpha * mix(0.12, 1.0, vFacing);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, a * (1.0 - uGlow));
}
