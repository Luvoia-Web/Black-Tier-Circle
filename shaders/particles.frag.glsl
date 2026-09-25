uniform float uTheme;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = smoothstep(0.5, 0.05, d);
  vec3 gold = vec3(0.90, 0.78, 0.48);
  vec3 ink = vec3(0.45, 0.30, 0.08);
  vec3 color = mix(gold, ink, uTheme);
  gl_FragColor = vec4(color, glow * vAlpha * mix(0.85, 0.55, uTheme));
}
