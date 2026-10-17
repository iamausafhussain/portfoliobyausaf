// Land dots (GL-1). During formation (GL-6) the dots appear in a quick wave, each settling
// onto its place from just above it (aFrom, world space), so the globe is drawn in, not
// scattered.
attribute vec3 aFrom;
attribute vec3 aFromColor;
attribute float aRand;

uniform float uForm;       // 0–1
uniform float uSize;       // px at the front of the globe
uniform float uPixelRatio;
uniform vec3 uDotDark;
uniform vec3 uDotLight;
uniform float uGlow;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float start = aRand * 0.75;
  float e = smoothstep(start, start + 0.25, uForm);
  vec4 onGlobe = modelMatrix * vec4(position, 1.0);
  vec3 world = mix(aFrom, onGlobe.xyz, e);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  // how much the dot faces the camera: the far side is hidden all the way through, so the
  // gathering dots already read as a globe, not a cloud
  vec3 n = normalize(mat3(viewMatrix) * normalize(onGlobe.xyz));
  float facing = clamp(n.z, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.45, facing);

  gl_PointSize = uSize * uPixelRatio * (0.55 + 0.45 * facing) * mix(1.15, 1.0, e);
  vec3 dotCol = mix(uDotLight, uDotDark, uGlow);
  vColor = mix(aFromColor, dotCol, e);
  vAlpha = edge * e * mix(0.62, 0.7, uGlow);
}
