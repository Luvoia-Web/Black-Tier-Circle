'use client';

import { useEffect, useState } from 'react';

type CountUpProps = {
  readonly value: number;
  readonly suffix?: string;
  readonly digits?: number;
};

export function CountUp({ value, suffix = '', digits = 0 }: CountUpProps): JSX.Element {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(value)) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / 700);
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  const text = digits > 0 ? shown.toFixed(digits) : Math.round(shown).toLocaleString('en-US');
  return <span className="tabular-nums">{text}{suffix}</span>;
}
