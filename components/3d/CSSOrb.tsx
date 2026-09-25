/**
 * Animated gradient gem used when a Spline scene is not ready.
 */
export function CSSOrb(): JSX.Element {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <div className="css-orb h-40 w-40 rounded-[36%] bg-gradient-to-br from-violet-500/80 via-indigo-500/50 to-amber-400/40 blur-[1px]" />
    </div>
  );
}
