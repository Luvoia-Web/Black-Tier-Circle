/**
 * @file components/landing/LandingFooter.tsx
 *
 * Quiet close. No WebGL — the page exhales here.
 */

import Link from 'next/link';
import { ROUTES } from '@/lib/navigation';

export function LandingFooter(): JSX.Element {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <span className="mark" aria-hidden="true" />
        <div>
          <p className="wordmark">Black Tier Circle</p>
          <p>Your Telegram store, live in minutes.</p>
        </div>
      </div>
      <nav aria-label="Footer">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <Link href={ROUTES.public.apiDocs}>API Docs</Link>
        <Link href={ROUTES.login}>Login</Link>
      </nav>
      <p className="legal">© 2026 Black Tier Circle. Non-custodial Telegram commerce platform.</p>
    </footer>
  );
}
