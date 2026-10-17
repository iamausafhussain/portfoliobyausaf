// Packet routes (GL-5): faint arcs, brighter for the focused or hovered project.
attribute float aRoute;
attribute float aT;
uniform float uActive;
uniform float uHover;
uniform float uOpacity;
uniform float uTime;
varying float vAlpha;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  float on = max(step(abs(aRoute - uActive), 0.5), step(abs(aRoute - uHover), 0.5));
  // fade the ends into the nodes; a slow shimmer travels along highlighted routes
  float ends = smoothstep(0.0, 0.08, aT) * smoothstep(1.0, 0.92, aT);
  float shimmer = 0.75 + 0.25 * sin(aT * 18.0 - uTime * 3.0);
  // routes behind the globe fade out instead of showing past its edge
  vec3 n = normalize(mat3(viewMatrix) * normalize(world.xyz));
  float facing = smoothstep(0.08, 0.4, n.z);
  vAlpha = ends * facing * uOpacity * mix(0.18, 0.75 * shimmer, on);
}
