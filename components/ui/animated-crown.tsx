/**
 * @file components/ui/animated-crown.tsx
 *
 * Geometric crown mark. Pure SVG — no image asset.
 *
 * @module Components
 */

type AnimatedCrownProps = {
  readonly size?: number;
  readonly float?: boolean;
};

/**
 * Five-point crown with a radial glow. Float and stroke pulse are CSS-only.
 */
export function AnimatedCrown({ size = 80, float = true }: AnimatedCrownProps): JSX.Element {
  return (
    <div
      className="relative isolate inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/20 blur-2xl"
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 78"
        fill="none"
        aria-hidden="true"
        className={float ? 'btc-crown-float relative' : 'relative'}
        style={{ filter: 'drop-shadow(0 0 8px var(--crown-glow))' }}
      >
        <polygon
          points="3,66 14,34 26,50 36,26 50,6 64,26 74,50 86,34 97,66"
          fill="var(--crown-fill)"
          stroke="var(--crown-stroke)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          className="btc-crown-pulse"
        />
        <path
          d="M8 64h84v8a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3v-8z"
          fill="var(--crown-fill)"
          stroke="var(--crown-stroke)"
          strokeWidth={1.5}
          className="btc-crown-pulse"
        />
      </svg>
    </div>
  );
}
