/**
 * @file components/onboarding-wizard.tsx
 *
 * Three-step first-run setup. Steps slide in place; the browser back button
 * stays on this page so setup is finished from the in-card controls.
 *
 * @module Components
 */

'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { gsap, prefersReducedMotion, useGSAP } from '@/lib/landing/gsap';
import { Button } from '@/components/ui/Button';
import { AnimatedCrown } from '@/components/ui/animated-crown';
import {
  AuthLeftPanel,
  AuthRightPanel,
  fieldClass,
  glassCardClass,
  headingClass,
  quoteClass,
  submitClass,
} from '@/components/auth/auth-chrome';

const TERMS = `Black Tier Circle is a multi-tenant platform for selling digital products through Telegram.

Payments are collected in USDT (BEP20), Binance Pay, or reseller wallet balance. You are responsible for the prices you set, the products you offer, and the support you provide to your customers.

Resellers pay the platform wholesale price and keep the margin between wholesale and the price shown in their bot. Wallet top-ups use tokens issued by the platform owner.

Digital goods are delivered automatically after payment. Completed orders are final: Black Tier Circle does not offer refunds on delivered products.

You agree to keep your bot token private, to use the platform lawfully, and to the Privacy Policy. The platform owner may suspend an account that abuses payments, suppliers, or customers.`;

type Step = 1 | 2 | 3;

const STEP_COPY: Record<Step, { readonly quote: string; readonly sub: string }> = {
  1: {
    quote: 'Your store. Your brand. Your customers.',
    sub: 'Join the platform built for resellers who mean business.',
  },
  2: {
    quote: 'Every sale remembered. Every pattern learned. Go.',
    sub: 'MemoryOS watches your store so you never miss a signal.',
  },
  3: {
    quote: 'The curtain rises. The platform is yours.',
    sub: 'Intelligence activated. Commerce begins now.',
  },
};

function StepDots({ step }: { readonly step: Step }): JSX.Element {
  return (
    <div className="mt-8 flex items-center justify-center" role="group" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((item, index) => {
        const active = step === 3 || item === step;
        return (
          <div key={item} className="flex items-center">
            {index > 0 ? (
              <span className="auth-connector h-0.5 w-6" aria-hidden="true" />
            ) : null}
            <span
              aria-hidden="true"
              className={
                active
                  ? 'h-2 w-8 rounded-full bg-purple-600 transition-all duration-300'
                  : 'auth-dot-idle h-2 w-2 rounded-full transition-all duration-300'
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function LaunchButton({
  saving,
  accepted,
  onLaunch,
}: {
  readonly saving: boolean;
  readonly accepted: boolean;
  readonly onLaunch: () => void;
}): JSX.Element {
  const launchBtnRef = useRef<HTMLButtonElement>(null);

  useGSAP(() => {
    if (launchBtnRef.current === null || prefersReducedMotion()) {
      return;
    }
    gsap.to(launchBtnRef.current, {
      boxShadow: '0 0 20px 4px rgba(124,58,237,0.5)',
      duration: 1,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut',
    });
  }, { dependencies: [] });

  return (
    <button
      ref={launchBtnRef}
      type="button"
      className={submitClass}
      disabled={!accepted || saving}
      onClick={onLaunch}
    >
      {saving ? 'Launching…' : 'Launch My Dashboard →'}
    </button>
  );
}

/**
 * Renders the onboarding card and posts the finished profile.
 */
export function OnboardingWizard(): JSX.Element {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
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
  const copy = STEP_COPY[step];

  return (
    <div className="flex min-h-dvh w-full flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
      <AuthLeftPanel>
        <div className="relative mt-6 min-h-[9.5rem] w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.4 }}
            >
              <p className={quoteClass}>{copy.quote}</p>
              <p className="mt-2 text-sm text-muted-foreground">{copy.sub}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </AuthLeftPanel>

      <AuthRightPanel>
        <motion.div
          className={glassCardClass}
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              data-direction={direction}
              initial={reduceMotion ? false : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -40 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeInOut' }}
            >
              {step === 1 ? (
                <form onSubmit={continueFromName}>
                  <div className="mb-4 flex justify-center">
                    <AnimatedCrown size={40} float={false} />
                  </div>
                  <h1 className={headingClass}>Welcome to Black Tier Circle</h1>
                  <p className="mt-1 text-sm text-muted-foreground">What should we call you?</p>
                  <label className="mb-1.5 mt-6 block text-xs font-medium text-muted-foreground" htmlFor="onboarding-name">
                    Name
                  </label>
                  <input
                    id="onboarding-name"
                    className={fieldClass}
                    value={displayName}
                    placeholder="Kushal Chaudhari"
                    autoComplete="name"
                    aria-invalid={nameError !== null}
                    aria-describedby={nameError ? 'onboarding-name-error' : 'onboarding-name-help'}
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
                  <p id="onboarding-name-help" className="mt-1 text-xs text-muted-foreground">
                    This will appear on your profile and dashboard
                  </p>
                  {nameError ? (
                    <p id="onboarding-name-error" className="auth-alert-red mt-2 text-[13px]" role="alert">
                      {nameError}
                    </p>
                  ) : null}
                  <button type="submit" className={`${submitClass} mt-6`} disabled={!nameReady}>
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
                  <h1 className={headingClass}>Tell us about your store</h1>
                  <label className="mb-1.5 mt-6 block text-xs font-medium text-muted-foreground" htmlFor="onboarding-store">
                    Store name
                  </label>
                  <input
                    id="onboarding-store"
                    className={fieldClass}
                    value={storeName}
                    placeholder="My Awesome Store"
                    onChange={(event) => setStoreName(event.target.value)}
                  />
                  <label className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground" htmlFor="onboarding-support">
                    Support contact
                  </label>
                  <input
                    id="onboarding-support"
                    className={fieldClass}
                    value={supportContact}
                    placeholder="@TelegramHandle or email"
                    onChange={(event) => setSupportContact(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Both optional — you can set them later in settings</p>
                  <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                    <Button type="button" variant="ghost" className="h-11 cursor-pointer px-4 text-muted-foreground" onClick={() => go(1)}>
                      Back
                    </Button>
                    <button type="submit" className={submitClass}>
                      Continue
                    </button>
                  </div>
                </form>
              ) : null}

              {step === 3 ? (
                <div>
                  <h1 className={headingClass}>You&apos;re almost ready!</h1>
                  <dl className="mt-5 space-y-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Name</dt>
                      <dd className="text-sm text-foreground">{displayName.trim()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Store</dt>
                      <dd className="text-sm text-foreground">{storeName.trim() || 'Set later'}</dd>
                    </div>
                  </dl>
                  <div
                    className="auth-terms mt-4 h-32 overflow-y-auto rounded-xl border p-3 text-xs text-muted-foreground"
                    tabIndex={0}
                  >
                    {TERMS}
                  </div>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-purple-600"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                    />
                    <span>I agree to the Terms of Service and Privacy Policy</span>
                  </label>
                  {formError ? (
                    <p className="auth-alert-red mt-2 text-[13px]" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 cursor-pointer px-4 text-muted-foreground"
                      onClick={() => go(2)}
                      disabled={saving}
                    >
                      Back
                    </Button>
                    <LaunchButton saving={saving} accepted={accepted} onLaunch={() => void launch()} />
                  </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
          <StepDots step={step} />
        </motion.div>
      </AuthRightPanel>
    </div>
  );
}
