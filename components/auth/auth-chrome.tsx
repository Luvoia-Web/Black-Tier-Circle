/**
 * @file components/auth/auth-chrome.tsx
 *
 * Shared visual shell for login and onboarding. No auth behavior.
 *
 * @module Components
 */

import type { ReactNode } from 'react';
import { AnimatedCrown } from '@/components/ui/animated-crown';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export const glassCardClass =
  'auth-glass relative z-10 w-full max-w-[420px] rounded-2xl border p-8 shadow-2xl backdrop-blur-xl';

export const fieldClass =
  'h-11 w-full rounded-xl border border-purple-500/30 bg-background px-4 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-[var(--muted-foreground)] focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus-visible:outline-none';

export const submitClass =
  'inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-sm font-medium text-white transition-all duration-200 hover:from-purple-500 hover:to-violet-500 hover:shadow-lg hover:shadow-purple-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-60';

export const googleClass =
  'auth-google-btn inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium text-foreground transition-all duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-60';

export const quoteClass = 'text-4xl font-light leading-tight text-foreground';

export const headingClass = 'auth-heading text-2xl font-semibold';

const PARTICLES = Array.from({ length: 25 }, (_, index) => ({
  left: `${(index * 19 + 4) % 94}%`,
  top: `${(index * 31 + 6) % 90}%`,
  delay: `${((index * 0.24) % 6).toFixed(2)}s`,
  duration: `${(4 + ((index * 5) % 17) * 0.25).toFixed(2)}s`,
}));

function ParticleField(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
      {PARTICLES.map((particle) => (
        <span
          key={`${particle.left}-${particle.top}`}
          className="btc-particle absolute h-1 w-1 rounded-full bg-purple-500/20"
          style={{
            left: particle.left,
            top: particle.top,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
          }}
        />
      ))}
    </div>
  );
}

type AuthLeftPanelProps = {
  readonly children: ReactNode;
};

/**
 * Full-height brand panel: crown, wordmark, drifting particles, and slot for the quote.
 */
export function AuthLeftPanel({ children }: AuthLeftPanelProps): JSX.Element {
  return (
    <aside className="relative flex min-h-[320px] w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--auth-panel-from)] via-[var(--auth-panel-via)] to-[var(--auth-panel-to)] px-8 py-14 lg:h-full lg:w-[55%] lg:basis-[55%] lg:px-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-[var(--brand-glow)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-4rem] right-[-2rem] h-64 w-64 rounded-full bg-purple-600/15 blur-3xl"
      />
      <ParticleField />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <AnimatedCrown size={100} float />
        <p className="auth-wordmark mt-4 text-xs font-semibold uppercase tracking-[0.3em]">
          BLACK TIER CIRCLE
        </p>
        {children}
      </div>
    </aside>
  );
}

type AuthRightPanelProps = {
  readonly children: ReactNode;
};

/**
 * Form column. Scrolls internally so a tall card never clips under the theme toggle.
 */
export function AuthRightPanel({ children }: AuthRightPanelProps): JSX.Element {
  return (
    <section className="relative flex w-full min-w-0 flex-1 overflow-y-auto bg-background lg:h-full lg:w-[45%] lg:flex-none lg:basis-[45%]">
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggle />
      </div>
      <div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-16 sm:px-8">
        {children}
      </div>
    </section>
  );
}
