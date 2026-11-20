'use client';

/**
 * Marketing page. Referral rewards, points adjustment with buyer @username picker,
 * freebies, and store announcement banners.
 */

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { GrowthPanel } from '@/components/growth/growth-panel';
import type { GrowthPayload } from '@/components/growth/types';
import {
  Button,
  Card,
  ErrorState,
  Skeleton,
  SwitchField,
  TextAreaField,
  TextField,
  notify,
} from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';

export function MarketingView(): JSX.Element {
  const growth = useData<GrowthPayload>('/api/platform/growth');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!growth.data || hydrated) return;
    setTitle(growth.data.events.title);
    setBody(growth.data.events.body);
    setLink(growth.data.events.link);
    setEnabled(growth.data.events.enabled);
    setHydrated(true);
  }, [growth.data, hydrated]);

  async function saveAnnouncement(): Promise<void> {
    setSaving(true);
    const result = await runAction('/api/platform/growth', {
      method: 'POST',
      body: { action: 'events', events: { enabled, title, body, link } },
    });
    setSaving(false);
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    notify({ message: 'Announcement banner saved.' });
    growth.refetch();
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">Marketing</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Referral rewards, points adjustments, freebies, and store banner announcements.
        </p>
      </header>

      {growth.loading && !growth.data ? (
        <div className="space-y-4" aria-label="Loading marketing">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="glass-card rounded-lg p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-44 w-full" />
        </div>
      ) : null}

      {growth.error && !growth.data ? (
        <ErrorState
          message={growth.error.message}
          requestId={growth.error.requestId}
          detail={growth.error.detail}
          onRetry={growth.refetch}
        />
      ) : null}

      {growth.data ? (
        <>
          <GrowthPanel base={growth.data.role === 'owner' ? API_ROUTES.ownerGrowth : API_ROUTES.resellerGrowth} />

          <Card
            title="Announcements"
            action={<Megaphone className="h-4 w-4 text-rose" aria-hidden="true" />}
          >
            <div className="space-y-3">
              <SwitchField
                id="events-on"
                label="Show store announcement banner in bot"
                checked={enabled}
                onChange={setEnabled}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id="events-title"
                  label="Announcement title"
                  placeholder="Weekend Flash Offer"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <TextField
                  id="events-link"
                  label="Optional link (https://)"
                  placeholder="https://t.me/yourchannel"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                />
              </div>
              <TextAreaField
                id="events-body"
                label="Announcement message"
                placeholder="Share news, restocks, or limited promos shown at the top of the bot."
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <Button loading={saving} onClick={() => void saveAnnouncement()}>
                Save announcement
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </section>
  );
}
