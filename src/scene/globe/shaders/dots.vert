// Land dots (GL-1). During formation (GL-6) each dot flies from where its hero particle
// was (aFrom, world space) to its place on the globe.
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
  float e = smoothstep(0.0, 1.0, clamp(uForm * 1.35 - aRand * 0.35, 0.0, 1.0));
  vec4 onGlobe = modelMatrix * vec4(position, 1.0);
  vec3 world = mix(aFrom, onGlobe.xyz, e);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  // how much the dot faces the camera (only once it's on the globe)
  vec3 n = normalize(mat3(viewMatrix) * normalize(onGlobe.xyz));
  float facing = clamp(n.z, 0.0, 1.0);
  float edge = mix(1.0, smoothstep(0.0, 0.45, facing), e);

  gl_PointSize = uSize * uPixelRatio * mix(1.6, 0.55 + 0.45 * facing, e);
  vec3 dotCol = mix(uDotLight, uDotDark, uGlow);
  vColor = mix(aFromColor, dotCol, e);
  vAlpha = edge * mix(0.9, mix(0.62, 0.7, uGlow), e);
}
