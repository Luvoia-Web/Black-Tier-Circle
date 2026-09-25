/**
 * @file app/(landing)/page.tsx
 *
 * Public marketing page. No session, no Supabase, no dashboard imports.
 */

import { LandingNav } from '@/components/landing/LandingNav';
import { Hero } from '@/components/landing/Hero';
import { TransitionWipe } from '@/components/landing/TransitionWipe';
import { ProblemSolution } from '@/components/landing/ProblemSolution';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { FeaturesGrid } from '@/components/landing/FeaturesGrid';
import { PlatformPreview } from '@/components/landing/PlatformPreview';
import { StatsCounter } from '@/components/landing/StatsCounter';
import { PricingCards } from '@/components/landing/PricingCards';
import { TrustSection } from '@/components/landing/TrustSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';

export default function LandingPage(): JSX.Element {
  return (
    <>
      <LandingNav />
      <main id="content">
        <Hero />
        <TransitionWipe />
        <ProblemSolution />
        <HowItWorks />
        <FeaturesGrid />
        <PlatformPreview />
        <StatsCounter />
        <PricingCards />
        <TrustSection />
        <CTASection />
        <LandingFooter />
      </main>
    </>
  );
}
