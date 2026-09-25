uniform float uTime;
uniform float uHover;
uniform float uTheme;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.0);

  vec3 color1 = vec3(0.5, 0.2, 1.0);
  vec3 color2 = vec3(0.2, 0.8, 1.0);
  vec3 color3 = vec3(1.0, 0.3, 0.8);

  float t = sin(uTime * (0.5 + uHover * 1.6) + vPosition.y * 2.0) * 0.5 + 0.5;
  vec3 color = mix(mix(color1, color2, t), color3, fresnel);
  vec3 gold = vec3(0.72, 0.54, 0.22);
  color = mix(gold, color, 0.82 + uHover * 0.12);
  color += fresnel * vec3(0.25, 0.18, 0.05) * (0.4 + uHover);
  color = mix(color, color * vec3(0.42, 0.28, 0.12), uTheme * 0.45);

  float alpha = mix(0.84, 1.0, fresnel);
  gl_FragColor = vec4(color, alpha);
}
