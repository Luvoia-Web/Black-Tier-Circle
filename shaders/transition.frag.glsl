uniform float uProgress;
uniform float uTime;
varying vec2 vUv;

void main() {
  float wave = sin(vUv.x * 9.0 + uTime * 1.3) * 0.04 + sin(vUv.x * 21.0 - uTime * 0.8) * 0.015;
  float y = vUv.y + wave;
  float edge = abs(y - (1.0 - uProgress));
  float rim = smoothstep(0.07, 0.0, edge);
  float haze = smoothstep(0.28, 0.0, edge);
  vec3 ink = vec3(0.05, 0.04, 0.03);
  vec3 gold = vec3(0.82, 0.62, 0.26);
  vec3 violet = vec3(0.42, 0.2, 0.9);
  float shift = 0.5 + 0.5 * sin(vUv.x * 8.0 + uTime);
  vec3 color = mix(ink, mix(gold, violet, shift), rim);
  float alpha = haze * 0.18 + rim * 0.92;
  alpha *= smoothstep(0.0, 0.06, uProgress) * smoothstep(1.0, 0.94, uProgress);
  gl_FragColor = vec4(color, alpha);
}
