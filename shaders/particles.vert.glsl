uniform float uTime;
uniform vec2 uMouse;
uniform float uPixelRatio;
attribute float aScale;
attribute float aSpeed;
varying float vAlpha;

void main() {
  vec3 pos = position;
  float t = uTime * aSpeed;
  pos.x += sin(t + position.y * 0.7) * 0.16;
  pos.y += cos(t * 0.8 + position.x * 0.6) * 0.14;
  pos.z += sin(t * 0.55 + position.z) * 0.1;

  vec2 cursor = uMouse * vec2(4.2, 2.6);
  vec2 delta = cursor - pos.xy;
  float dist = length(delta);
  pos.xy += normalize(delta + 0.0001) * smoothstep(2.4, 0.15, dist) * 0.42;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aScale * uPixelRatio * (140.0 / max(1.0, -mvPosition.z));
  vAlpha = smoothstep(9.5, 1.8, -mvPosition.z);
}
