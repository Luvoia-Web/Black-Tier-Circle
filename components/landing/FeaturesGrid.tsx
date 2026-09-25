/**
 * @file components/landing/FeaturesGrid.tsx
 *
 * Glass feature cards with pointer tilt and a Lottie ring on hover.
 */

'use client';

import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Lottie, type LottieHandle } from 'lottie-react';
import { Bot, LayoutDashboard, Link2, Shield, Wallet, Zap } from 'lucide-react';
import { lottieRing } from '@/components/landing/lottieRing';

const FEATURES: readonly { title: string; body: string; icon: ReactNode }[] = [
  {
    title: 'Your Own Branded Bot',
    body: 'Customers never see Black Tier Circle. Your name, your brand.',
    icon: <Bot aria-hidden="true" />,
  },
  {
    title: 'USDT Payments Built In',
    body: 'BEP20, TRC20, and Binance Pay. No payment gateway headaches.',
    icon: <Wallet aria-hidden="true" />,
  },
  {
    title: 'Instant Auto-Delivery',
    body: 'Products delivered the second payment clears. No manual work.',
    icon: <Zap aria-hidden="true" />,
  },
  {
    title: 'Real-Time Dashboard',
    body: 'Track orders, revenue, customers, and wallet balance live.',
    icon: <LayoutDashboard aria-hidden="true" />,
  },
  {
    title: 'Supplier Integration',
    body: 'Connect product suppliers via API. Unlimited catalog.',
    icon: <Link2 aria-hidden="true" />,
  },
  {
    title: 'Non-Custodial',
    body: 'You keep your payment credentials. We never hold your money.',
    icon: <Shield aria-hidden="true" />,
  },
];

function FeatureCard({
  title,
  body,
  icon,
}: {
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
}): JSX.Element {
  const cardRef = useRef<HTMLElement>(null);
  const lottieRef = useRef<LottieHandle>(null);
  const [hovered, setHovered] = useState(false);

  const onMove = (event: React.MouseEvent<HTMLElement>): void => {
    const node = cardRef.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.transform = `perspective(900px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg) translateY(-6px)`;
  };

  const onLeave = (): void => {
    const node = cardRef.current;
    if (node) {
      node.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
    }
    setHovered(false);
    lottieRef.current?.stop();
  };

  return (
    <article
      ref={cardRef}
      className="feature-card"
      onMouseMove={onMove}
      onMouseEnter={() => {
        setHovered(true);
        lottieRef.current?.play();
      }}
      onMouseLeave={onLeave}
    >
      <div className="feature-icon">
        {icon}
        {hovered ? (
          <Lottie lottieRef={lottieRef} src={lottieRing} loop autoplay className="feature-lottie" />
        ) : null}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

export function FeaturesGrid(): JSX.Element {
  return (
    <section className="section features" id="features">
      <div className="section-inner">
        <p className="eyebrow">What you get</p>
        <h2>A store that already knows how to sell.</h2>
        <motion.div
          className="feature-grid"
          variants={list}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-10% 0px' }}
        >
          {FEATURES.map((feature) => (
            <motion.div key={feature.title} variants={item}>
              <FeatureCard title={feature.title} body={feature.body} icon={feature.icon} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
