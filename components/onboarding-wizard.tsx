/**
 * @file components/onboarding-wizard.tsx
 *
 * Three-step first-run setup. Steps slide in place; the browser back button
 * stays on this page so setup is finished from the in-card controls.
 *
 * @module Components
 */

'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const TERMS = `Black Tier Circle is a multi-tenant platform for selling digital products through Telegram.

Payments are collected in USDT (BEP20), Binance Pay, or reseller wallet balance. You are responsible for the prices you set, the products you offer, and the support you provide to your customers.

Resellers pay the platform wholesale price and keep the margin between wholesale and the price shown in their bot. Wallet top-ups use tokens issued by the platform owner.

Digital goods are delivered automatically after payment. Completed orders are final: Black Tier Circle does not offer refunds on delivered products.

You agree to keep your bot token private, to use the platform lawfully, and to the Privacy Policy. The platform owner may suspend an account that abuses payments, suppliers, or customers.`;

type Step = 1 | 2 | 3;

function DiamondMark(): JSX.Element {
  return (
    <svg className="onboarding-diamond" width="42" height="42" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.2 14.2 8 8 14.8 1.8 8 8 1.2z" fill="var(--accent)" />
    </svg>
  );
}

/**
 * Renders the onboarding card and posts the finished profile.
 */
export function OnboardingWizard(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [displayName, setDisplayName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [supportContact, setSupportContact] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const trap = (): void => {
      window.history.pushState(null, '', window.location.href);
    };
    trap();
    window.addEventListener('popstate', trap);
    return () => window.removeEventListener('popstate', trap);
  }, []);

  function go(next: Step): void {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    setFormError(null);
  }

  function continueFromName(event: FormEvent): void {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setNameError('Enter the name you want on your profile.');
      return;
    }
    setNameError(null);
    go(2);
  }

  async function launch(): Promise<void> {
    if (!accepted || saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          storeName: storeName.trim(),
          supportContact: supportContact.trim(),
          acceptedTerms: true,
        }),
      });
      const json = (await response.json()) as {
        success?: boolean;
        data?: { destination?: string };
        error?: { message?: string };
      };
      if (!response.ok || !json.success || !json.data?.destination) {
        setFormError(json.error?.message ?? 'Unable to finish setup. Try again.');
        setSaving(false);
        return;
      }
      router.push(json.data.destination);
      router.refresh();
    } catch {
      setFormError('Unable to finish setup. Try again.');
      setSaving(false);
    }
  }

  const nameReady = displayName.trim().length >= 2;

  return (
    <div className="onboarding-card">
      <div className="onboarding-progress" role="group" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((item) => (
          <span
            key={item}
            className={`onboarding-dot${item === step ? ' is-current' : ''}${item < step ? ' is-done' : ''}`}
            aria-hidden="true"
          />
        ))}
        <span className="onboarding-step-label">
          {step}/3
        </span>
      </div>

      <div className="onboarding-viewport">
        <div key={step} className="onboarding-pane" data-direction={direction}>
          {step === 1 ? (
            <form onSubmit={continueFromName}>
              <div className="mb-5 flex justify-center">
                <DiamondMark />
              </div>
              <h1 className="onboarding-title">Welcome to Black Tier Circle</h1>
              <p className="onboarding-subtitle">Let&apos;s get your account set up in just a few steps.</p>
              <label className="onboarding-label" htmlFor="onboarding-name">
                What&apos;s your name?
              </label>
              <input
                id="onboarding-name"
                className="login-field"
                value={displayName}
                placeholder="Kushal Chaudhari"
                autoComplete="name"
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  if (nameError) {
                    setNameError(null);
                  }
                }}
                onBlur={() => {
                  if (displayName.trim().length > 0 && displayName.trim().length < 2) {
                    setNameError('Enter the name you want on your profile.');
                  }
                }}
              />
              <p className="onboarding-help">This will appear on your profile and dashboard</p>
              {nameError ? (
                <p className="onboarding-error" role="alert">
                  {nameError}
                </p>
              ) : null}
              <button type="submit" className="login-submit mt-6" disabled={!nameReady}>
                Continue
              </button>
            </form>
          ) : null}

          {step === 2 ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                go(3);
              }}
            >
              <h1 className="onboarding-title">Tell us about your store</h1>
              <p className="onboarding-subtitle">Customers will see this when they visit your bot</p>
              <label className="onboarding-label" htmlFor="onboarding-store">
                Store name
              </label>
              <input
                id="onboarding-store"
                className="login-field"
                value={storeName}
                placeholder="My Awesome Store"
                onChange={(event) => setStoreName(event.target.value)}
              />
              <label className="onboarding-label mt-4" htmlFor="onboarding-support">
                Support contact
              </label>
              <input
                id="onboarding-support"
                className="login-field"
                value={supportContact}
                placeholder="@TelegramHandle or email"
                onChange={(event) => setSupportContact(event.target.value)}
              />
              <p className="onboarding-help">Both optional — you can set them later in settings</p>
              <div className="mt-6 flex gap-3">
                <button type="button" className="onboarding-back" onClick={() => go(1)}>
                  Back
                </button>
                <button type="submit" className="login-submit">
                  Continue
                </button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <div>
              <h1 className="onboarding-title">You&apos;re almost ready!</h1>
              <p className="onboarding-subtitle">Review your details, then open your dashboard.</p>
              <dl className="onboarding-summary">
                <div>
                  <dt>Name</dt>
                  <dd>{displayName.trim()}</dd>
                </div>
                <div>
                  <dt>Store</dt>
                  <dd>{storeName.trim() || 'Set later'}</dd>
                </div>
              </dl>
              <div className="onboarding-terms" tabIndex={0}>
                {TERMS}
              </div>
              <label className="onboarding-check">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>I agree to the Terms of Service and Privacy Policy</span>
              </label>
              {formError ? (
                <p className="onboarding-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="mt-6 flex gap-3">
                <button type="button" className="onboarding-back" onClick={() => go(2)} disabled={saving}>
                  Back
                </button>
                <button type="button" className="login-submit" disabled={!accepted || saving} onClick={() => void launch()}>
                  {saving ? 'Launching…' : 'Launch My Dashboard'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
