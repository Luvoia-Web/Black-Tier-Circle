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
import { dashboardHomeForRole, isSafeNextPath } from '@/lib/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { UserRole } from '@/modules/identity/types';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

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
  const next = searchParams.get('next');
  const urlError = searchParams.get('error');
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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError || profile === null) {
        setError('Unable to load your profile. Contact support.');
        return;
      }

      const row = profile as { role: unknown; status: unknown };
      if (row.status === 'suspended') {
        setError('This account has been suspended. Contact the owner.');
        await supabase.auth.signOut();
        return;
      }
      if (!isUserRole(row.role)) {
        setError('Unable to load your profile. Contact support.');
        return;
      }

      const destination =
        next !== null && isSafeNextPath(next, row.role) ? next : dashboardHomeForRole(row.role);
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

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2 text-[22px] font-semibold text-white">
        <DiamondMark />
        Black Tier Circle
      </div>
      <p className="mb-8 text-sm text-white/50">The reseller platform for digital products</p>

      <div className="login-tabs mb-6" role="tablist" aria-label="Account">
        <span className="login-tab-indicator" data-tab={tab} />
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signin'}
          className="login-tab"
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
          className="login-tab"
          onClick={() => {
            setTab('signup');
            setError(null);
          }}
        >
          Create Account
        </button>
      </div>

      {tab === 'signin' ? (
        <form key="signin" onSubmit={(event) => void onSubmit(event)} className="login-pane flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-white/70">
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="login-field"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/70">
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
                className="login-field pr-12"
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((current) => !current)} />
            </span>
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void onForgotPassword()}
              disabled={forgotLoading}
              className="text-xs text-[var(--accent-soft)] hover:text-white disabled:opacity-60"
            >
              {forgotLoading ? 'Sending…' : 'Forgot password?'}
            </button>
          </div>
          <button type="submit" disabled={loading || googleLoading} className="login-submit">
            {loading ? <Spinner /> : 'Sign In'}
          </button>
        </form>
      ) : (
        <form key="signup" onSubmit={onCreateAccount} className="login-pane flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-white/70">
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
              className="login-field"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/70">
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="login-field"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/70">
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
                className="login-field pr-12"
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((current) => !current)} />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/70">
            Confirm password
            <input
              type={showPassword ? 'text' : 'password'}
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="login-field"
            />
          </label>
          <p className="login-banner login-banner-amber">
            <InfoMark />
            <span>Account creation requires an invitation from the store owner.</span>
          </p>
          <button type="submit" className="login-submit">
            Create Account
          </button>
        </form>
      )}

      <div className="my-6 flex items-center gap-3 text-xs text-white/30">
        <span className="h-px flex-1 bg-white/10" />
        or continue with
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <button
        type="button"
        disabled={googleLoading || loading}
        onClick={() => void signInWithGoogle()}
        className="login-google"
      >
        <GoogleMark />
        {googleLoading ? <Spinner dark /> : 'Continue with Google'}
      </button>

      {error ? (
        <p className={`login-banner mt-4 ${tone === 'amber' ? 'login-banner-amber' : 'login-banner-red'}`} role="alert">
          <InfoMark />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function PasswordToggle({ shown, onToggle }: { readonly shown: boolean; readonly onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
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

function Spinner({ dark = false }: { readonly dark?: boolean }): JSX.Element {
  return (
    <span
      className={`h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${dark ? 'border-gray-900' : 'border-white'}`}
      aria-hidden="true"
    />
  );
}

function DiamondMark(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.2 14.2 8 8 14.8 1.8 8 8 1.2z" fill="var(--accent)" />
    </svg>
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

export default function LoginPage(): JSX.Element {
  return (
    <main className="login-stage">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-orb login-orb-1" aria-hidden="true" />
      <div className="login-orb login-orb-2" aria-hidden="true" />
      <div className="login-orb login-orb-3" aria-hidden="true" />
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <div className="flex w-full flex-col items-center">
        <div className="login-card">
          <Suspense fallback={<p className="text-sm text-white/50">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="relative z-10 mt-6 text-center text-xs text-white/20">
          Protected by Black Tier Circle
          <span className="mx-2">·</span>
          <a href="/login" className="hover:text-white/50">
            Privacy Policy
          </a>
          <span className="mx-2">·</span>
          <a href="/login" className="hover:text-white/50">
            Terms
          </a>
        </p>
      </div>
    </main>
  );
}
