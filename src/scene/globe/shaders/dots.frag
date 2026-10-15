// Round dots. Premultiplied output: alpha 0 adds light (dark theme), alpha 1 paints over
// (light theme); uGlow blends between the two (as in the hero particles).
uniform float uGlow;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.35, 0.5, d)) * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, a * (1.0 - uGlow * 0.6));
}
