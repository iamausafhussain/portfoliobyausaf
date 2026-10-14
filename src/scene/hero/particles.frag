// Round soft particles. Output is premultiplied: alpha 0 adds light (dark theme glow),
// alpha 1 paints over (light theme ink); uGlow blends between the two (PT-3).
uniform float uGlow;
uniform float uAlpha;

varying vec3 vColor;
varying float vE;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float square = 1.0 - smoothstep(0.48, 0.5, max(abs(gl_PointCoord.x - 0.5), abs(gl_PointCoord.y - 0.5)));
  float disc = 1.0 - smoothstep(0.38, 0.5, d);
  float glow = exp(-d * d * 14.0) * (1.0 - smoothstep(0.45, 0.5, d));
  // whole picture at the start (squares tile it), round dots in the cloud
  float shape = mix(square, mix(disc, glow, uGlow), smoothstep(0.0, 0.25, vE));
  // the settled cloud is quieter, so text over it stays easy to read
  float a = shape * uAlpha * mix(1.0, 0.7, vE);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a * (1.0 - uGlow));
}
