uniform vec3 uColor;
uniform float uGlow;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor * vAlpha, vAlpha * (1.0 - uGlow));
}
