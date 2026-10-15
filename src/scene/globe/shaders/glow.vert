// Nodes and packets (GL-2, GL-3, GL-5): sprites with a core and, in the dark theme, a halo.
attribute float aSize;     // px
attribute vec3 aColor;
attribute float aAlpha;

uniform float uPixelRatio;
uniform float uOpacity;

varying vec3 vColor;
varying float vAlpha;
varying float vFacing;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(viewMatrix) * normalize(world.xyz));
  vFacing = smoothstep(-0.05, 0.25, n.z);
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_PointSize = aSize * uPixelRatio;
  vColor = aColor;
  vAlpha = aAlpha * uOpacity;
}
