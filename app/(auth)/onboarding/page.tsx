/**
 * @file app/(auth)/onboarding/page.tsx
 *
 * First-run setup. Middleware keeps signed-out visitors on login and
 * finished accounts on their dashboard.
 *
 * @module Auth
 */

import { OnboardingWizard } from '@/components/onboarding-wizard';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function OnboardingPage(): JSX.Element {
  return (
    <main className="login-stage onboarding-stage">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb login-orb-1" aria-hidden="true" />
      <div className="login-orb login-orb-2" aria-hidden="true" />
      <div className="login-orb login-orb-3" aria-hidden="true" />
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <OnboardingWizard />
    </main>
  );
}
