/**
 * Isolation, use cases, metrics, onboarding, finale, and footer.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Brain, Check, Moon, Plug, Sun } from 'lucide-react';
import { toggleTheme, useThemeDark } from '@/components/landing/useThemeDark';

const TABS = [
  {
    id: 'owner',
    label: 'Platform Owner',
    points: [
      'Aggregate intelligence across every store',
      'Run the Operations Control Tower',
      'Spot patterns before they become incidents',
    ],
    panel: 'Control tower · 14 stores · anomaly quiet',
  },
  {
    id: 'store',
    label: 'Reseller / Store',
    points: [
      'Customer intelligence on every thread',
      'Recovery memory for repeat incidents',
      'Store patterns that compound over time',
    ],
    panel: 'Customer panel · preferences, objections, WHY?',
  },
  {
    id: 'customer',
    label: 'End Customer',
    points: [
      'A personal reply, not a generic script',
      'Preferences remembered across visits',
      'Offers that match how they actually buy',
    ],
    panel: 'Telegram thread · remembered, then answered',
  },
] as const;

const STEPS = [
  {
    num: '01',
    title: 'Connect your Telegram bot',
    body: 'Point MemoryOS at the bot you already run. No new checkout. No new app for customers.',
    icon: <Plug size={22} aria-hidden="true" />,
  },
  {
    num: '02',
    title: 'AI starts learning',
    body: 'Every message, order, and objection lands in the right bank. grok-3 reads it in context.',
    icon: <Brain size={22} aria-hidden="true" />,
  },
  {
    num: '03',
    title: 'Commerce remembers',
    body: 'The next conversation starts from what already happened. The crystal stays crystallized.',
    icon: <span className="spark" aria-hidden="true">✦</span>,
  },
];

export function MemoryBottom(): JSX.Element {
  const dark = useThemeDark();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('owner');
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <>
      <section id="architecture" className="section arch">
        <div className="wrap arch-grid">
          <div>
            <p className="eyebrow">Trust</p>
            <h2 className="grad-text" data-split>
              Multi-tenant. Zero leakage.
            </h2>
            <p className="lede">Three isolation layers. Mathematically enforced.</p>
            <pre className="smoke">
              <span>npm run memory:smoke</span>
              <span className="pass">✓ 3 PASS</span>
              {'\n'}
              <span className="quote">&quot;Cross-tenant bank returns 0 memories&quot;</span>
            </pre>
            <ul className="trust-row">
              <li>AES-256-GCM</li>
              <li>Supabase RLS</li>
              <li>Server-side only</li>
              <li>Zero NEXT_PUBLIC_ secrets</li>
            </ul>
          </div>
          <div className="rings" aria-hidden="true">
            <svg viewBox="0 0 420 420">
              <circle className="ring gold" cx="210" cy="210" r="168" />
              <circle className="ring blue" cx="210" cy="210" r="112" />
              <circle className="ring violet" cx="210" cy="210" r="58" />
              <circle className="orbit o1" cx="210" cy="42" r="4" />
              <circle className="orbit o2" cx="322" cy="210" r="3.5" />
              <circle className="orbit o3" cx="210" cy="152" r="3" />
            </svg>
            <span className="ring-label gold">Platform</span>
            <span className="ring-label blue">Store</span>
            <span className="ring-label violet">Customer</span>
          </div>
        </div>
      </section>

      <section id="use-cases" className="section">
        <div className="wrap">
          <p className="eyebrow">Use cases</p>
          <h2 className="grad-text" data-split>
            One memory. Three points of view.
          </h2>
          <div className="tabs" role="tablist" aria-label="Use cases">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'is-on' : ''}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="case-frame">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                className="case-grid"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
              >
                <ul>
                  {active.points.map((point) => (
                    <li key={point}>
                      <Check size={16} aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="case-screen">
                  <span>{active.panel}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section id="metrics" className="section metrics">
        <div className="wrap">
          <h2 className="grad-text" data-split>
            Built for the next generation of commerce
          </h2>
          <div className="metric-grid reveal-group">
            <article className="reveal">
              <p className="stat-num grad-text" data-count="3">3</p>
              <p>layers of memory</p>
            </article>
            <article className="reveal">
              <p className="stat-num grad-text" data-count="100" data-suffix="%">100%</p>
              <p>bank isolation</p>
            </article>
            <article className="reveal">
              <p className="stat-num grad-text" data-count="50" data-prefix="<" data-suffix="ms">&lt;50ms</p>
              <p>recall time</p>
            </article>
            <article className="reveal">
              <p className="stat-num grad-text">∞</p>
              <p>memories — no limit</p>
            </article>
          </div>
          <p className="built-with">
            Built with
            <span>Supabase</span>
            <span>Vercel</span>
            <span>Hindsight by Vectorize</span>
            <span>Grok / xAI</span>
            <span>Telegram</span>
          </p>
        </div>
      </section>

      <section className="section steps">
        <div className="wrap">
          <p className="eyebrow">Start</p>
          <h2 className="grad-text" data-split>
            Memory starts working the moment you connect.
          </h2>
          <div className="step-row reveal-group">
            {STEPS.map((step, index) => (
              <article key={step.num} className="step reveal">
                {index > 0 ? <span className="step-line" aria-hidden="true" /> : null}
                <p className="show-num grad-text">{step.num}</p>
                <span className="bento-icon">{step.icon}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="finale" data-crystal="finale">
        <div className="finale-copy">
          <h2 className="grad-text">Commerce should learn.</h2>
          <p className="finale-big grad-text">Now it does.</p>
          <Link href="/login" className="btn btn-grad btn-xl">
            Start Building Memory
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p>No credit card required. Memory starts working immediately.</p>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-field" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i
              key={index}
              style={{
                left: `${(index * 17) % 100}%`,
                animationDelay: `${(index % 7) * 0.35}s`,
                animationDuration: `${4 + (index % 5)}s`,
              }}
            />
          ))}
        </div>
        <div className="wrap foot-grid">
          <div>
            <Link href="#hero" className="mem-logo">
              <span className="mem-mark" aria-hidden="true">BT</span>
              <span className="mem-word">Black Tier MemoryOS</span>
            </Link>
            <p>Commerce intelligence with a memory that stays in its bank.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#architecture">Architecture</a>
            <Link href="/api-docs">Docs</Link>
            <a href="https://github.com/Luvoia-Web/Black-Tier-Circle">GitHub</a>
          </nav>
          <div className="foot-side">
            <p>Powered by Hindsight by Vectorize</p>
            <button
              type="button"
              className="icon-btn"
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={(event) => toggleTheme({ x: event.clientX, y: event.clientY })}
            >
              {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <p className="copy">© {new Date().getFullYear()} Black Tier Circle</p>
      </footer>
    </>
  );
}
