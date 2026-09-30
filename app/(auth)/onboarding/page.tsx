/**
 * @file app/(auth)/onboarding/page.tsx
 *
 * First-run setup. Middleware keeps signed-out visitors on login and
 * finished accounts on their dashboard.
 *
 * @module Auth
 */

import { OnboardingWizard } from '@/components/onboarding-wizard';

export default function OnboardingPage(): JSX.Element {
  return (
    <main className="min-h-dvh w-full bg-background text-foreground">
      <OnboardingWizard />
    </main>
  );
}
