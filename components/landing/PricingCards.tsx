/**
 * @file components/landing/PricingCards.tsx
 *
 * Trial and Pro. Pro is the recommended desk.
 */

'use client';

import { useRef } from 'react';
import { ROUTES } from '@/lib/navigation';
import { MagneticButton } from '@/components/landing/MagneticButton';

const TIERS = [
  {
    name: 'Free / Trial',
    price: '₹0',
    cadence: 'to start',
    featured: false,
    cta: 'Get Started Free',
    points: ['Connect your bot', 'Up to 10 products', 'Platform branding shown', 'Basic analytics'],
  },
  {
    name: 'Pro',
    price: '₹2,000',
    cadence: '/ month',
    featured: true,
    cta: 'Start Pro Trial',
    points: [
      'Unlimited products',
      'Your branding only',
      'Full analytics dashboard',
      'Supplier API integration',
      'Priority support',
      'API access',
    ],
  },
] as const;

export function PricingCards(): JSX.Element {
  return (
    <section className="section pricing" id="pricing">
      <div className="section-inner">
        <p className="eyebrow">Pricing</p>
        <h2>Start free. Upgrade when the store is real.</h2>
        <div className="price-grid">
          {TIERS.map((tier) => (
            <PriceCard key={tier.name} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceCard({
  tier,
}: {
  readonly tier: (typeof TIERS)[number];
}): JSX.Element {
  const ref = useRef<HTMLElement>(null);

  const onMove = (event: React.MouseEvent<HTMLElement>): void => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.transform = `perspective(1000px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`;
  };

  return (
    <article
      ref={ref}
      className={`price-card ${tier.featured ? 'is-featured' : ''}`}
      onMouseMove={onMove}
      onMouseLeave={() => {
        if (ref.current) {
          ref.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
        }
      }}
    >
      {tier.featured ? <p className="recommend">Recommended</p> : <p className="recommend is-empty">Trial</p>}
      <h3>{tier.name}</h3>
      <p className="price">
        {tier.price}
        <span>{tier.cadence}</span>
      </p>
      <ul>
        {tier.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <MagneticButton href={ROUTES.login} variant={tier.featured ? 'solid' : 'ghost'}>
        {tier.cta}
      </MagneticButton>
    </article>
  );
}
