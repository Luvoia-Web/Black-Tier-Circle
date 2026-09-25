/**
 * @file components/landing/TrustSection.tsx
 *
 * Why a reseller stays: the money, the bot, and the rails stay theirs.
 */

'use client';

import dynamic from 'next/dynamic';

const TrustShapes = dynamic(() => import('@/components/landing/TrustShapes'), { ssr: false });

const PILLARS = [
  {
    title: 'Non-Custodial',
    body: 'We never hold your money. Your USDT wallet is yours. Your Binance account is yours. We just connect them.',
  },
  {
    title: 'No Lock-In',
    body: 'Your bot is yours. Your customers are yours. Export your data anytime. Leave anytime.',
  },
  {
    title: 'Built for India',
    body: 'USDT payments work everywhere. No UPI restrictions, no PayPal limits, no bank blocks.',
  },
] as const;

export function TrustSection(): JSX.Element {
  return (
    <section className="section trust" id="trust">
      <TrustShapes />
      <div className="section-inner">
        <p className="eyebrow">Why resellers stay</p>
        <h2>After the collapses, the only platform worth using is one that cannot hold your money.</h2>
        <div className="trust-grid">
          {PILLARS.map((pillar, index) => (
            <article key={pillar.title}>
              <span>0{index + 1}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
