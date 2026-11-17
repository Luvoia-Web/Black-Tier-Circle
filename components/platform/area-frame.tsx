/**
 * @file components/platform/area-frame.tsx
 *
 * Shared heading for an area page before that area’s own phase fills it in.
 */

type AreaFrameProps = {
  readonly title: string;
  readonly lede: string;
};

export function AreaFrame({ title, lede }: AreaFrameProps): JSX.Element {
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{lede}</p>
    </section>
  );
}
