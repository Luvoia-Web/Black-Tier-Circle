/**
 * @file components/landing/WebGLFallback.tsx
 *
 * CSS crystal used when WebGL is unavailable or still loading.
 */

export function WebGLFallback(): JSX.Element {
  return (
    <div className="css-stage" aria-hidden="true">
      <div className="css-crystal" />
      <div className="css-ring" />
    </div>
  );
}
