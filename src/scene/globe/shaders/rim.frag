// Atmosphere: drawn on the back faces of a slightly larger sphere. Seen from the front,
// those faces span a disc around the globe: their normal points away from the camera most
// (z ≈ -0.48) right at the globe's edge and not at all (z = 0) at the outer rim, so the
// glow is strongest against the globe and fades outwards.
// Dark: additive glow in accent-2. Light: a faint shadow that grounds the porcelain globe.
uniform vec3 uGlowColor;
uniform vec3 uShadowColor;
uniform float uGlow;
uniform float uOpacity;
varying vec3 vNormal;
void main() {
  float edge = pow(clamp(-vNormal.z / 0.48, 0.0, 1.0), 2.6);
  float a = edge * uOpacity * mix(0.16, 0.5, uGlow);
  vec3 col = mix(uShadowColor, uGlowColor, uGlow);
  gl_FragColor = vec4(col * a, a * (1.0 - uGlow));
}
