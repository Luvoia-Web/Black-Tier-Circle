/**
 * Product chapters, live chat, and the feature bento.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Brain, CircuitBoard, Send, Shield, Webhook } from 'lucide-react';

const REPLY =
  'Based on their purchase history — bulk buyer, responded to your 10% discount last time — I would suggest leading with quantity pricing.';

const CHAPTERS = [
  {
    id: 'ch1',
    num: '01',
    title: 'Before & After Memory',
    body: 'Toggle between no-memory and full-memory mode. Watch your AI transform from generic to personal.',
    points: ['Recalled preferences', 'Known objections', 'AI recommendation'],
  },
  {
    id: 'ch2',
    num: '02',
    title: 'Why did the AI say that?',
    body: 'Every recommendation has evidence. The WHY? button shows you exactly which memories the AI used.',
    points: ['Evidence chain', 'Type badges', 'Powered by Hindsight'],
  },
  {
    id: 'ch3',
    num: '03',
    title: 'Never solve the same problem twice',
    body: 'Type an incident. The system recalls every time this happened before and what fixed it.',
    points: ['Incident memory', 'Recovery patterns', 'Suggested resolution'],
  },
];

function CustomerMock(): JSX.Element {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-bar">
        <strong>Asha Verma</strong>
        <div className="seg">
          <span>Without Memory</span>
          <span className="on">With Memory</span>
        </div>
      </div>
      <p className="mock-kicker">Preferences</p>
      <div className="mock-card">Prefers bulk orders of 50 or more. Reorders every other Friday.</div>
      <p className="mock-kicker">Known objections</p>
      <div className="mock-card warn">Price-sensitive unless a quantity break is on the table.</div>
      <p className="mock-kicker">AI recommendation</p>
      <div className="mock-card">
        Lead with a 10% break at 40 units. She converted on that offer last month.
        <div className="mock-row">
          <span className="why">WHY? See Evidence</span>
          <span className="ok">Converted</span>
        </div>
      </div>
    </div>
  );
}

function InspectorMock(): JSX.Element {
  return (
    <div className="mock mock-modal" aria-hidden="true">
      <p className="mock-kicker">Memory inspector</p>
      <h3>Why this recommendation?</h3>
      <p className="mock-lead">Lead with quantity pricing. She bought bulk twice and asked about discounts.</p>
      <p className="mock-kicker">Evidence from memory</p>
      <div className="mock-card">
        Responded to a 10% discount on a 40-unit order.
        <span className="badge">preference</span>
      </div>
      <div className="mock-card">
        Objected to single-unit pricing in March.
        <span className="badge gold">objection</span>
      </div>
      <p className="powered">Powered by Hindsight</p>
    </div>
  );
}

function RecoveryMock(): JSX.Element {
  return (
    <div className="mock" aria-hidden="true">
      <p className="mock-kicker">Commerce recovery</p>
      <div className="mock-input">Payment webhook timed out</div>
      <div className="mock-card">
        <strong>Seen 4 times</strong>
        <p>Retry the signed webhook, then mark the order paid from the wallet ledger.</p>
      </div>
      <div className="mock-card">
        <strong>What fixed it</strong>
        <p>Resend from the bot, not the dashboard. The signature window is 60 seconds.</p>
      </div>
    </div>
  );
}

function ChatDemo(): JSX.Element {
  const [text, setText] = useState('');
  const [showBadge, setShowBadge] = useState(false);
  const [run, setRun] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return undefined;
    let timer = 0;
    let index = 0;
    let started = false;

    const begin = (): void => {
      if (started) return;
      started = true;
      setText('');
      setShowBadge(true);
      timer = window.setInterval(() => {
        index += 1;
        setText(REPLY.slice(0, index));
        if (index >= REPLY.length) {
          window.clearInterval(timer);
        }
      }, 30);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) begin();
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [run]);

  return (
    <div className="chat-shell" ref={root}>
      <div className="bubble user">What should I offer this customer?</div>
      <div className="bubble ai">
        <span className={showBadge ? 'mem-badge is-on' : 'mem-badge'}>✦ Memory</span>
        <p>{text || ' '}</p>
      </div>
      <div className="chat-actions">
        <button type="button" className="text-btn" onClick={() => setRun((value) => value + 1)}>
          Replay
        </button>
        <Link href="/login">
          Try it yourself
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

const SMALL = [
  { icon: <Shield size={20} aria-hidden="true" />, title: 'Bank Isolation', body: 'Zero cross-tenant leakage. Mathematically guaranteed.' },
  { icon: <CircuitBoard size={20} aria-hidden="true" />, title: 'Fail-Open Design', body: 'Memory enriches. It never blocks commerce.' },
  { icon: <Webhook size={20} aria-hidden="true" />, title: 'Universal Event API', body: 'Any source, any memory bank. One endpoint.' },
  { icon: <Send size={20} aria-hidden="true" />, title: 'Telegram Native', body: 'Your bot, your customers, your memory.' },
  { icon: <Brain size={20} aria-hidden="true" />, title: 'Grok AI', body: 'grok-3 with full memory context on every message.' },
];

export function MemoryMiddle(): JSX.Element {
  return (
    <>
      <section id="showcase" className="showcase" data-crystal="showcase">
        <div className="show-frame">
          <div className="show-chapter" id="ch1">
            <div className="wrap show-grid">
              <CustomerMock />
              <div className="show-copy">
                <p className="show-num grad-text">{CHAPTERS[0]?.num}</p>
                <h2 className="grad-text">{CHAPTERS[0]?.title}</h2>
                <p>{CHAPTERS[0]?.body}</p>
                <ul>
                  {CHAPTERS[0]?.points.map((point) => (
                    <li key={point}>✦ {point}</li>
                  ))}
                </ul>
                <div className="float-labels">
                  <span>Prefers bulk orders</span>
                  <span>Price-sensitive</span>
                  <span>Responds to discounts</span>
                </div>
              </div>
            </div>
          </div>
          <div className="show-chapter" id="ch2">
            <div className="wrap show-grid flip">
              <div className="show-copy">
                <p className="show-num grad-text">{CHAPTERS[1]?.num}</p>
                <h2 className="grad-text">{CHAPTERS[1]?.title}</h2>
                <p>{CHAPTERS[1]?.body}</p>
                <a className="btn btn-ghost" href="#chat">
                  See the evidence chain
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
              <InspectorMock />
            </div>
          </div>
          <div className="show-chapter" id="ch3">
            <div className="wrap show-grid">
              <RecoveryMock />
              <div className="show-copy">
                <p className="show-num grad-text">{CHAPTERS[2]?.num}</p>
                <h2 className="grad-text">{CHAPTERS[2]?.title}</h2>
                <p>{CHAPTERS[2]?.body}</p>
                <ul>
                  {CHAPTERS[2]?.points.map((point) => (
                    <li key={point}>✦ {point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="show-dots" aria-hidden="true">
            <span className="show-dot is-on" />
            <span className="show-dot" />
            <span className="show-dot" />
          </div>
        </div>
      </section>

      <section id="chat" className="section chat-section">
        <div className="wrap chat-layout">
          <div>
            <p className="eyebrow">Live demo</p>
            <h2 className="grad-text" data-split>
              AI that knows your customers.
            </h2>
            <p className="lede">The ✦ Memory badge means your AI recalled history before responding.</p>
          </div>
          <ChatDemo />
        </div>
      </section>

      <section id="features" className="section">
        <div className="wrap">
          <p className="eyebrow">Capabilities</p>
          <h2 className="grad-text" data-split>
            Everything your store needs to learn.
          </h2>
          <div className="bento reveal-group">
            <article className="bento-card large reveal tone-violet" data-cursor="hover">
              <p className="eyebrow">Learning</p>
              <h3>Outcome Learning Loop</h3>
              <p>When customers convert or reject, the AI learns and store memory updates automatically.</p>
              <div className="flow" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <i />
              </div>
            </article>
            <article className="bento-card large reveal tone-blue" data-cursor="hover">
              <p className="eyebrow">Operations</p>
              <h3>Operations Control Tower</h3>
              <p>Platform-wide memory intelligence. A god-view for owners.</p>
              <div className="tower" aria-hidden="true">
                <strong data-count="12840">0</strong>
                <em>memories live</em>
                <div className="bars">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </article>
            {SMALL.map((card) => (
              <article key={card.title} className="bento-card reveal" data-cursor="hover">
                <span className="bento-icon">{card.icon}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
