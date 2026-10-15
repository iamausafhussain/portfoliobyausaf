// Matte sphere: dark globe-base with a soft key light (dark), porcelain with gentle edge
// shading (light). Premultiplied output (see dots.frag).
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uGlow;
uniform float uOpacity;
varying vec3 vNormal;
void main() {
  float facing = clamp(vNormal.z, 0.0, 1.0);
  float key = clamp(dot(vNormal, normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
  vec3 dark = uDark * (0.85 + 0.35 * key);
  vec3 light = uLight * (0.86 + 0.14 * pow(facing, 0.6));
  vec3 col = mix(light, dark, uGlow);
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
