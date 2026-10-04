/**
 * @file app/(auth)/login/page.tsx
 *
 * Email/password sign-in via the Supabase browser client.
 * Resellers join only via invite — no sign-up link.
 *
 * @module Auth
 */

'use client';

import { type FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ROUTES, dashboardHomeForRole, isSafeNextPath } from '@/lib/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { UserRole } from '@/modules/identity/types';
import { AuthLeftPanel, AuthRightPanel, fieldClass, glassCardClass, googleClass, quoteClass, submitClass } from '@/components/auth/auth-chrome';
import { AnimatedCrown } from '@/components/ui/animated-crown';

function isUserRole(value: unknown): value is UserRole {
  return value === 'owner' || value === 'reseller' || value === 'staff';
}

function oauthErrorMessage(code: string | null): string | null {
  if (code === 'auth_failed') {
    return 'Sign in failed. Please try again.';
  }
  if (code === 'no_profile') {
    return 'Account not found. Contact the store owner for an invite.';
  }
  if (code === 'no_code') {
    return 'Sign in was cancelled. Please try again.';
  }
  if (code === 'unknown_role') {
    return 'Unable to determine your account type. Contact support.';
  }
  return null;
}

function bannerTone(code: string | null, message: string): 'red' | 'amber' {
  if (code === 'no_profile' || message.toLowerCase().includes('invit')) {
    return 'amber';
  }
  return 'red';
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const next = searchParams.get('next');
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(() => oauthErrorMessage(urlError));
  const [tone, setTone] = useState<'red' | 'amber'>(() => bannerTone(urlError, oauthErrorMessage(urlError) ?? ''));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  function showError(message: string, nextTone: 'red' | 'amber' = 'red'): void {
    setTone(nextTone);
    setError(message);
  }

  async function signInWithGoogle(): Promise<void> {
    setError(null);
    setTone('red');
    setGoogleLoading(true);
    try {
      const origin =
        (typeof window !== 'undefined' && window.location.origin) ||
        process.env.NEXT_PUBLIC_APP_URL;
      if (!origin) {
        setError('Unable to start Google sign-in. Try again.');
        setGoogleLoading(false);
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin.replace(/\/$/, '')}/auth/callback` },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch {
      setError('Unable to start Google sign-in. Try again.');
      setGoogleLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setTone('red');
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError || data.user === null) {
        setError('Invalid email or password');
        return;
      }

      const profileQuery = await supabase
        .from('profiles')
        .select('role, status, onboarding_completed')
        .eq('id', data.user.id)
        .maybeSingle();

      let profile = profileQuery.data as { role: unknown; status: unknown; onboarding_completed?: boolean } | null;
      if (profileQuery.error) {
        const fallback = await supabase.from('profiles').select('role, status').eq('id', data.user.id).maybeSingle();
        if (fallback.error || fallback.data === null) {
          setError('Unable to load your profile. Contact support.');
          return;
        }
        profile = { ...(fallback.data as { role: unknown; status: unknown }), onboarding_completed: true };
      }

      if (profile === null) {
        setError('Unable to load your profile. Contact support.');
        return;
      }

      const row = profile;
      if (row.status === 'suspended') {
        router.push(ROUTES.suspended);
        router.refresh();
        return;
      }
      if (!isUserRole(row.role)) {
        setError('Unable to load your profile. Contact support.');
        return;
      }

      const destination =
        row.role === 'reseller' && row.status === 'pending'
          ? row.onboarding_completed === true
            ? ROUTES.pending
            : ROUTES.onboarding
          : row.onboarding_completed === true
            ? next !== null && isSafeNextPath(next, row.role)
              ? next
              : dashboardHomeForRole(row.role)
            : ROUTES.onboarding;
      router.push(destination);
      router.refresh();
    } catch {
      setError('Unable to sign in. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function onCreateAccount(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (password !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }
    if (displayName.trim().length < 2) {
      showError('Enter the name you want on your account.');
      return;
    }
    showError('Account creation requires an invitation from the store owner.', 'amber');
  }

  async function onForgotPassword(): Promise<void> {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned) {
      showError('Enter your email address first.');
      return;
    }
    setForgotLoading(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleaned, {
        redirectTo: `${origin}/login`,
      });
      if (resetError) {
        showError(resetError.message);
        return;
      }
      showError('If an account exists for that email, a reset link is on the way.', 'amber');
    } catch {
      showError('Unable to send a reset link. Try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  const reduceMotion = useReducedMotion();

  return (
    <div className="flex w-full flex-col items-center">
      <AnimatedCrown size={36} float={false} />
      <h1 className="mt-3 text-xl font-semibold text-foreground">Black Tier Circle</h1>

      <div className="auth-tabs mt-4 flex w-full rounded-xl p-1" role="tablist" aria-label="Account">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signin'}
          className={tab === 'signin'
            ? 'flex-1 cursor-pointer rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white'
            : 'flex-1 cursor-pointer rounded-lg px-4 py-1.5 text-sm text-muted-foreground'}
          onClick={() => {
            setTab('signin');
            setError(null);
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signup'}
          className={tab === 'signup'
            ? 'flex-1 cursor-pointer rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white'
            : 'flex-1 cursor-pointer rounded-lg px-4 py-1.5 text-sm text-muted-foreground'}
          onClick={() => {
            setTab('signup');
            setError(null);
          }}
        >
          Create Account
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'signin' ? (
          <motion.form
            key="signin"
            onSubmit={(event) => void onSubmit(event)}
            className="mt-5 flex w-full flex-col gap-4"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
          >
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Password
              <span className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${fieldClass} pr-12`}
                />
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((current) => !current)} />
              </span>
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void onForgotPassword()}
                disabled={forgotLoading}
                className="auth-link cursor-pointer text-xs hover:text-foreground disabled:opacity-60"
              >
                {forgotLoading ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
            <button type="submit" disabled={loading || googleLoading} className={submitClass}>
              {loading ? <Spinner /> : 'Sign In'}
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="signup"
            onSubmit={onCreateAccount}
            className="mt-5 flex w-full flex-col gap-4"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
          >
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Display name
              <input
                type="text"
                name="name"
                autoComplete="name"
                required
                minLength={2}
                placeholder="Your name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Password
              <span className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${fieldClass} pr-12`}
                />
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((current) => !current)} />
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Confirm password
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={fieldClass}
              />
            </label>
            <p className="auth-alert-amber flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px]">
              <InfoMark />
              <span>Account creation requires an invitation from the store owner.</span>
            </p>
            <button type="submit" className={submitClass}>
              Create Account
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="my-6 flex w-full items-center gap-3 text-xs text-muted-foreground">
        <span className="auth-rule h-px flex-1" />
        or continue with
        <span className="auth-rule h-px flex-1" />
      </div>

      <button
        type="button"
        disabled={googleLoading || loading}
        onClick={() => void signInWithGoogle()}
        className={googleClass}
      >
        <GoogleMark />
        {googleLoading ? <Spinner /> : 'Continue with Google'}
      </button>

      {error ? (
        <p
          className={`mt-4 flex w-full items-start gap-2.5 rounded-xl px-4 py-3 text-[13px] ${
            tone === 'amber'
              ? 'auth-alert-amber border border-amber-500/30 bg-amber-500/10'
              : 'auth-alert-red border border-red-500/30 bg-red-500/10'
          }`}
          role="alert"
        >
          <InfoMark />
          <span>{error}</span>
        </p>
      ) : null}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        No public signup. Ask the store owner for an invite.
      </p>
    </div>
  );
}

function PasswordToggle({ shown, onToggle }: { readonly shown: boolean; readonly onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M3 3l18 18" strokeLinecap="round" />
          <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6M9.9 5.1A10.8 10.8 0 0 1 12 5c5 0 9.3 3.1 11 7.5a11.6 11.6 0 0 1-4.1 5.2M6.1 6.1A11.8 11.8 0 0 0 1 12.5C2.7 16.9 7 20 12 20c1.6 0 3.1-.3 4.5-.9" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5C21.3 16.9 17 20 12 20S2.7 16.9 1 12.5z" />
          <circle cx="12" cy="12.5" r="3" />
        </svg>
      )}
    </button>
  );
}

function Spinner(): JSX.Element {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

function InfoMark(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" className="mt-0.5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function GoogleMark(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.2 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.7 7.4l6.3 5.3C38.4 37.3 44 31.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

const LOGIN_STATS = [
  { value: '171', label: 'Tests Passing' },
  { value: '21', label: 'Migrations Live' },
  { value: '4', label: 'Payment Methods' },
  { value: '60s', label: 'Bot Deployment' },
] as const;

export default function LoginPage(): JSX.Element {
  const reduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-dvh w-full flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
      <AuthLeftPanel>
        <motion.p
          className={`mt-6 ${quoteClass}`}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
        >
          Commerce should learn. Now it does.
        </motion.p>
        <motion.div
          className="mt-10 grid w-full max-w-sm grid-cols-2 gap-x-8 gap-y-6 text-left"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { delayChildren: reduceMotion ? 0 : 0.6, staggerChildren: reduceMotion ? 0 : 0.08 } },
          }}
        >
          {LOGIN_STATS.map((stat) => (
            <motion.div
              key={stat.label}
              variants={{
                hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 12 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: reduceMotion ? 0 : 0.4, ease: 'easeOut' }}
            >
              <p className="auth-stat text-2xl font-bold">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </AuthLeftPanel>
      <AuthRightPanel>
        <motion.div
          className={glassCardClass}
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
        >
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </motion.div>
      </AuthRightPanel>
    </main>
  );
}
