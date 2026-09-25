/**
 * @file app/(dashboard)/reseller/account/page.tsx
 *
 * Reseller personal profile and account security.
 *
 * @module Dashboard
 */

'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AccountStudio } from '@/components/account/AccountStudio';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { PageHeader } from '@/components/ui/page-header';
import { copyToClipboard } from '@/lib/clipboard';
import { API_ROUTES } from '@/lib/navigation';

type ProfilePayload = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string;
};

const fieldClass =
  'w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-1)]';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? 'R'}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''}`.toUpperCase();
}

function memberSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function joinedLong(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Personal account page for the signed-in reseller.
 */
export default function ResellerAccountPage(): JSX.Element {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(API_ROUTES.resellerProfile)
      .then(async (response) => {
        const json = (await response.json()) as { success?: boolean; data?: ProfilePayload; error?: { message?: string } };
        if (!json.success || !json.data) {
          setError(json.error?.message ?? 'Unable to load your account');
          return;
        }
        setProfile(json.data);
        setDisplayName(json.data.displayName);
      })
      .catch(() => setError('Unable to load your account'));
  }, []);

  function onPickFile(next: File | null): void {
    if (!next) {
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      toast.error('Use a JPG, PNG, or WebP image');
      return;
    }
    if (next.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2MB or smaller');
      return;
    }
    setFile(next);
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(next);
  }

  async function saveName(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      toast.error('Enter your name');
      return;
    }
    setSavingName(true);
    try {
      const response = await fetch(API_ROUTES.resellerProfile, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !json.success) {
        toast.error(json.error?.message ?? 'Unable to save your name');
        return;
      }
      setNameSaved(true);
      toast.success('Name saved');
      router.refresh();
    } catch {
      toast.error('Unable to save your name');
    } finally {
      setSavingName(false);
    }
  }

  async function savePhoto(): Promise<void> {
    if (!file) {
      return;
    }
    setSavingPhoto(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(API_ROUTES.resellerProfileAvatar, { method: 'POST', body });
      const json = (await response.json()) as { success?: boolean; data?: { avatarUrl?: string | null }; error?: { message?: string } };
      if (!response.ok || !json.success) {
        toast.error(json.error?.message ?? 'Unable to upload photo');
        return;
      }
      setProfile((current) => (current ? { ...current, avatarUrl: json.data?.avatarUrl ?? current.avatarUrl } : current));
      setFile(null);
      setPreview(null);
      toast.success('Photo updated');
      router.refresh();
    } catch {
      toast.error('Unable to upload photo');
    } finally {
      setSavingPhoto(false);
    }
  }

  async function savePassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch(API_ROUTES.resellerProfilePassword, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const json = (await response.json()) as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !json.success) {
        toast.error(json.error?.message ?? 'Unable to update password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      toast.success('Password updated');
    } catch {
      toast.error('Unable to update password');
    } finally {
      setSavingPassword(false);
    }
  }

  async function copyId(): Promise<void> {
    if (!profile) {
      return;
    }
    const ok = await copyToClipboard(profile.id);
    setCopied(ok);
    if (ok) {
      toast.success('Reseller ID copied');
    }
  }

  const shownAvatar = preview ?? profile?.avatarUrl ?? null;
  const shortId = profile ? `${profile.id.slice(0, 8)}…${profile.id.slice(-4)}` : '';

  return (
    <div>
      <PageHeader title="Account" description="Your profile, photo, and sign-in security." />
      {error ? <p className="mb-4 text-sm text-[var(--red)]">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-xl font-semibold text-white"
              aria-label="Change photo"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                onPickFile(event.dataTransfer.files[0] ?? null);
              }}
            >
              {shownAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(displayName || 'Reseller')
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
            />
            <button type="button" className="mt-3 min-h-11 text-sm text-[var(--accent-soft)]" onClick={() => fileRef.current?.click()}>
              Change Photo
            </button>
            {file ? (
              <button
                type="button"
                className="mt-1 min-h-11 rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-sm text-white disabled:opacity-60"
                disabled={savingPhoto}
                onClick={() => void savePhoto()}
              >
                {savingPhoto ? 'Saving…' : 'Save photo'}
              </button>
            ) : null}
          </div>
          <form className="mt-6 space-y-3" onSubmit={(event) => void saveName(event)}>
            <label className="block text-sm text-[var(--text-2)]" htmlFor="account-name">
              Display name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="account-name" className={fieldClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <button
                type="submit"
                className="min-h-11 rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-sm text-white disabled:opacity-60"
                disabled={savingName || displayName.trim().length < 2}
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameSaved ? <LottiePlayer name="success-checkmark" loop={false} className="h-10 w-10" /> : null}
            <p className="text-sm text-[var(--text-2)]">
              Email: <span className="text-[var(--text-1)]">{profile?.email || '—'}</span>
            </p>
            <p className="text-sm text-[var(--text-2)]">Member since: {profile ? memberSince(profile.createdAt) : '—'}</p>
            <p className="text-sm text-[var(--text-2)]">Role: Reseller</p>
          </form>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Change password</h2>
            <form className="mt-4 space-y-3" onSubmit={(event) => void savePassword(event)}>
              <label className="block text-sm text-[var(--text-2)]" htmlFor="current-password">
                Current password
                <input id="current-password" type="password" autoComplete="current-password" className={`${fieldClass} mt-1`} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </label>
              <label className="block text-sm text-[var(--text-2)]" htmlFor="new-password">
                New password
                <input id="new-password" type="password" autoComplete="new-password" className={`${fieldClass} mt-1`} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
                  <span
                    className="block h-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, newPassword.length * 12)}%` }}
                  />
                </span>
              </label>
              <label className="block text-sm text-[var(--text-2)]" htmlFor="confirm-password">
                Confirm new
                <input id="confirm-password" type="password" autoComplete="new-password" className={`${fieldClass} mt-1`} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-sm text-white disabled:opacity-60"
                disabled={savingPassword || !currentPassword || newPassword.length < 8 || !confirmPassword}
              >
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
              {passwordSaved ? <LottiePlayer name="success-checkmark" loop={false} className="h-10 w-10" /> : null}
            </form>
          </section>

          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Account status</h2>
            <p className="mt-3 text-sm text-[var(--text-2)]">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--green)]" aria-hidden="true" />
              {profile?.status === 'suspended' ? 'Suspended' : 'Active'}
            </p>
            <p className="mt-2 text-sm text-[var(--text-2)]">Joined: {profile ? joinedLong(profile.createdAt) : '—'}</p>
            <p className="mt-2 text-sm text-[var(--text-2)]">Platform: Black Tier Circle</p>
            <p className="mt-4 text-sm text-[var(--text-2)]">Your Reseller ID</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="text-sm text-[var(--text-1)]">{shortId}</code>
              <button type="button" className="min-h-11 min-w-11 text-sm text-[var(--accent-soft)]" aria-label="Copy reseller ID" onClick={() => void copyId()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </section>

          <section className="rounded-[var(--r-lg)] border border-[var(--red)] bg-[var(--bg-card)] p-5">
            <h2 className="text-sm font-semibold text-[var(--red)]">Request account deletion</h2>
            <p className="mt-2 text-sm text-[var(--text-2)]">Contact support to delete your account. All data will be removed.</p>
            <button
              type="button"
              className="btc-btn-secondary mt-3"
              onClick={() => {
                const ok = window.confirm('Send a deletion request to the store owner? Your account stays active until they review it.');
                if (!ok) {
                  return;
                }
                void fetch(API_ROUTES.resellerProfileDeletion, { method: 'POST' }).then(async (response) => {
                  const json = (await response.json()) as { success?: boolean };
                  if (json.success) {
                    toast.success('Deletion request sent to the owner');
                  } else {
                    toast.error('Unable to send the request');
                  }
                });
              }}
            >
              Request deletion
            </button>
          </section>
        </div>
      </div>
      <AccountStudio />
    </div>
  );
}
