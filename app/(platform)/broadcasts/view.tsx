'use client';

/**
 * Broadcasts page. Bot Studio-parity Telegram message editor and live preview,
 * audience targeting, test send to self, rate-limited batch delivery, and scheduling.
 */

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { CalendarClock, Radio, Send, Users } from 'lucide-react';
import { editorNodesToTelegramHtml, telegramHtmlToEditorNodes } from '@/components/growth/telegram-html';
import type { BroadcastAudience, GrowthPayload } from '@/components/growth/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  RelativeTime,
  Skeleton,
  StatusPill,
  TextField,
  notify,
} from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { renderTemplate } from '@/modules/store-config/template';

const PLACEHOLDERS = ['name', 'store', 'balance', 'channel', 'group', 'website'] as const;
const EMOJIS = ['👋', '🛍️', '⚡', '✅', '🎁', '🔥', '💰', '🎉', '🔑', '✨', '⭐', '💬', '📢', '🔒'] as const;

const AUDIENCE_META: readonly { readonly id: BroadcastAudience; readonly label: string; readonly hint: string }[] = [
  { id: 'all', label: 'All active buyers', hint: 'Every unblocked buyer on this bot' },
  { id: 'buyers', label: 'Paying buyers', hint: 'Buyers with at least one verified order' },
  { id: 'inactive', label: 'Inactive 30+ days', hint: 'Buyers with no activity in 30 days' },
];

const BROADCAST_STATUS_META: Readonly<Record<string, { readonly label: string; readonly tone: 'info' | 'warn' | 'ok' | 'fault' | 'neutral' }>> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  sending: { label: 'Sending', tone: 'warn' },
  sent: { label: 'Sent', tone: 'ok' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'fault' },
};

function audienceLabel(id: BroadcastAudience): string {
  return AUDIENCE_META.find((item) => item.id === id)?.label ?? 'All active buyers';
}

function defaultScheduleInput(): string {
  const dt = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function BroadcastsView(): JSX.Element {
  const growth = useData<GrowthPayload>('/api/platform/growth');
  const editorRef = useRef<HTMLDivElement>(null);

  const [body, setBody] = useState('Hello {name}! New items are live in <b>{store}</b>.');
  const [tick, setTick] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [lightChat, setLightChat] = useState(false);

  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [armed, setArmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleInput);
  const [sendResult, setSendResult] = useState<{
    readonly recipients: number;
    readonly sent: number;
    readonly failed: number;
    readonly skippedBlocked: number;
  } | null>(null);

  const [chatId, setChatId] = useState('');
  const [chatHydrated, setChatHydrated] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!growth.data || chatHydrated) return;
    if (growth.data.testChatId) setChatId(growth.data.testChatId);
    setChatHydrated(true);
  }, [growth.data, chatHydrated]);

  const data = growth.data;
  const counts = data?.audiences ?? { all: 0, buyers: 0, inactive: 0, skippedBlocked: 0 };
  const selectedCount = counts[audience];
  const charLimit = imageUrl.trim() ? 1024 : 4096;

  const filledPreview = renderTemplate(body, {
    name: 'Asha',
    store: data?.storeName || 'Black Tier Circle',
    balance: '12.50 USDT',
    channel: data?.links.channel ?? '',
    group: data?.links.group ?? '',
    website: data?.links.website ?? '',
  });

  function insertText(snippet: string): void {
    setBody((prev) => `${prev}${snippet}`);
    setTick((n) => n + 1);
  }

  function applyFormat(command: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
    document.execCommand(command);
    if (editorRef.current) {
      setBody(editorNodesToTelegramHtml(editorRef.current));
    }
  }

  async function onTestSend(event: FormEvent): Promise<void> {
    event.preventDefault();
    setTesting(true);
    const result = await runAction('/api/platform/bot-studio/test', {
      body: {
        text: filledPreview || body,
        imageUrl: imageUrl.trim(),
        chatId: chatId.trim(),
      },
    });
    setTesting(false);
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    notify({ message: 'Test broadcast sent to your Telegram.' });
  }

  async function confirmSendNow(): Promise<void> {
    setSending(true);
    setSendResult(null);
    const result = await runAction<{ recipients: number; sent: number; failed: number; skippedBlocked: number }>(
      '/api/platform/growth',
      {
        method: 'POST',
        body: {
          action: 'broadcast',
          body,
          imageUrl: imageUrl.trim(),
          audience,
          confirm: true,
        },
      },
    );
    setSending(false);
    setArmed(false);
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    setSendResult(result.data);
    notify({ message: `Sent to ${result.data.sent} of ${result.data.recipients} buyers.` });
    growth.refetch();
  }

  async function submitSchedule(): Promise<void> {
    const parsed = Date.parse(scheduledFor);
    if (Number.isNaN(parsed)) {
      notify({ message: 'Pick a valid date and time.', tone: 'fault' });
      return;
    }
    setSending(true);
    const result = await runAction<{ recipients: number }>('/api/platform/growth', {
      method: 'POST',
      body: {
        action: 'schedule_broadcast',
        body,
        imageUrl: imageUrl.trim(),
        audience,
        scheduledFor: new Date(parsed).toISOString(),
      },
    });
    setSending(false);
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    notify({ message: `Broadcast scheduled for ${result.data.recipients} buyers.` });
    growth.refetch();
  }

  async function cancelJob(id: string): Promise<void> {
    const result = await runAction('/api/platform/growth', {
      method: 'POST',
      body: { action: 'cancel_broadcast', id },
    });
    if (!result.ok) {
      notify({ message: result.error.message, tone: 'fault' });
      return;
    }
    notify({ message: 'Scheduled broadcast canceled.' });
    growth.refetch();
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-[30px] font-medium tracking-tight text-ink">Broadcasts</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Compose, preview in Telegram, test on yourself, and schedule or send to your buyers.
        </p>
      </header>

      {growth.loading && !data ? (
        <div className="space-y-4" aria-label="Loading broadcasts">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
            <Skeleton className="h-[460px] w-full" />
          </div>
        </div>
      ) : null}

      {growth.error && !data ? (
        <ErrorState
          message={growth.error.message}
          requestId={growth.error.requestId}
          detail={growth.error.detail}
          onRetry={growth.refetch}
        />
      ) : null}

      {data ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Card title="Audience" action={<Users className="h-4 w-4 text-rose" aria-hidden="true" />}>
              <div className="grid gap-2.5 sm:grid-cols-3" role="tablist" aria-label="Broadcast audience">
                {AUDIENCE_META.map((item) => {
                  const active = audience === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-rose/60 bg-rose/15 text-ink'
                          : 'border-stroke bg-black/20 text-ink-soft hover:border-white/20'
                      }`}
                      onClick={() => {
                        setAudience(item.id);
                        setArmed(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ink">{item.label}</span>
                        <span className="font-num text-sm text-ink">{counts[item.id]}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-faint">{item.hint}</p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-xs text-ink-faint">
                {counts.skippedBlocked > 0
                  ? `${counts.skippedBlocked} blocked buyers are left out automatically.`
                  : 'Blocked buyers are left out automatically.'}
              </p>
            </Card>

            <Card title="Message editor">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['bold', 'B'],
                      ['italic', 'I'],
                      ['underline', 'U'],
                      ['strikeThrough', 'S'],
                    ] as const
                  ).map(([command, label]) => (
                    <button
                      key={command}
                      type="button"
                      className="h-8 w-8 rounded-md border border-white/10 text-sm text-ink hover:bg-white/[0.06]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyFormat(command)}
                    >
                      {label}
                    </button>
                  ))}
                  <Button variant="secondary" onClick={() => setEmojiOpen((open) => !open)}>
                    Emoji
                  </Button>
                </div>

                {emojiOpen ? (
                  <div className="flex flex-wrap gap-1">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="h-8 w-8 rounded-md border border-white/10 text-base hover:bg-white/[0.06]"
                        onClick={() => {
                          insertText(emoji);
                          setEmojiOpen(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div
                  key={tick}
                  ref={editorRef}
                  role="textbox"
                  aria-label="Broadcast message"
                  contentEditable
                  suppressContentEditableWarning
                  className="min-h-32 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink outline-none focus:border-rose/50"
                  dangerouslySetInnerHTML={{ __html: telegramHtmlToEditorNodes(body) }}
                  onBlur={(event) => setBody(editorNodesToTelegramHtml(event.currentTarget))}
                />

                <div className="flex flex-wrap items-center gap-1">
                  {PLACEHOLDERS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="rounded-pill border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-soft hover:text-ink"
                      onClick={() => insertText(`{${name}}`)}
                    >
                      {`{${name}}`}
                    </button>
                  ))}
                  <span className="text-[11px] text-ink-faint">tap to insert</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <TextField
                    id="broadcast-image"
                    label="Optional photo URL (https://)"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                  <p className={`pb-2 font-num text-xs ${body.length > charLimit ? 'text-amber' : 'text-ink-faint'}`}>
                    {body.length} / {charLimit}
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Test send to yourself">
              <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void onTestSend(event)}>
                <div className="min-w-[200px] flex-1">
                  <TextField
                    id="broadcast-test-chat"
                    label="Your Telegram chat id"
                    placeholder="123456789"
                    value={chatId}
                    onChange={(event) => setChatId(event.target.value)}
                  />
                </div>
                <Button type="submit" variant="secondary" loading={testing} disabled={!/^-?\d{5,20}$/.test(chatId.trim())}>
                  Send test to my Telegram
                </Button>
              </form>
            </Card>

            <Card
              title="Delivery"
              action={<Radio className="h-4 w-4 text-rose" aria-hidden="true" />}
            >
              <div className="space-y-3">
                <div className="inline-flex rounded-xl border border-stroke bg-black/25 p-1" role="tablist" aria-label="Delivery timing">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sendMode === 'now'}
                    className={`h-8 rounded-lg px-3 text-xs transition ${
                      sendMode === 'now' ? 'bg-white/12 text-ink' : 'text-ink-faint hover:text-ink-soft'
                    }`}
                    onClick={() => setSendMode('now')}
                  >
                    Send now
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sendMode === 'schedule'}
                    className={`h-8 rounded-lg px-3 text-xs transition ${
                      sendMode === 'schedule' ? 'bg-white/12 text-ink' : 'text-ink-faint hover:text-ink-soft'
                    }`}
                    onClick={() => {
                      setSendMode('schedule');
                      setArmed(false);
                    }}
                  >
                    Schedule for later
                  </button>
                </div>

                {sendMode === 'now' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-ink-soft">
                      Rate-limited to 20 messages per second to stay within Telegram bot limits. Audience:{' '}
                      <strong className="text-ink">{audienceLabel(audience)}</strong> ({selectedCount} buyers).
                    </p>

                    {sending ? (
                      <div className="space-y-1.5 rounded-lg border border-stroke bg-black/25 p-3">
                        <div className="flex items-center justify-between text-xs text-ink">
                          <span>Sending broadcast...</span>
                          <span className="font-num">{selectedCount} queued</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-pill bg-white/10">
                          <div className="h-full w-2/3 animate-pulse rounded-pill bg-rose" />
                        </div>
                      </div>
                    ) : null}

                    {sendResult ? (
                      <div className="space-y-1.5 rounded-lg border border-mint/30 bg-mint/10 p-3 text-xs">
                        <div className="flex items-center justify-between text-ink">
                          <span>Broadcast complete</span>
                          <span className="font-num">
                            {sendResult.sent} / {sendResult.recipients} delivered
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-pill bg-white/10">
                          <div
                            className="h-full rounded-pill bg-mint transition-[width]"
                            style={{
                              width: `${sendResult.recipients > 0 ? Math.round((sendResult.sent / sendResult.recipients) * 100) : 100}%`,
                            }}
                          />
                        </div>
                        <p className="text-ink-soft">
                          {sendResult.failed} failed · {sendResult.skippedBlocked} blocked skipped
                        </p>
                      </div>
                    ) : null}

                    {armed ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          loading={sending}
                          disabled={body.trim().length === 0 || selectedCount === 0}
                          onClick={() => void confirmSendNow()}
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          Confirm send to {selectedCount} buyers
                        </Button>
                        <Button variant="secondary" disabled={sending} onClick={() => setArmed(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={body.trim().length === 0 || selectedCount === 0}
                        onClick={() => setArmed(true)}
                      >
                        Review send to {selectedCount} buyers
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[220px] flex-1">
                        <TextField
                          id="broadcast-schedule-at"
                          label="Scheduled date and time"
                          type="datetime-local"
                          value={scheduledFor}
                          onChange={(event) => setScheduledFor(event.target.value)}
                        />
                      </div>
                      <Button
                        loading={sending}
                        disabled={body.trim().length === 0 || selectedCount === 0}
                        onClick={() => void submitSchedule()}
                      >
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        Schedule broadcast
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Recent and scheduled broadcasts">
              {data.broadcasts.length === 0 ? (
                <EmptyState
                  title="No broadcasts sent yet"
                  message="Compose a message above, send a test to yourself, and deliver or schedule it."
                />
              ) : (
                <ul className="space-y-2.5">
                  {data.broadcasts.map((job) => {
                    const pill = BROADCAST_STATUS_META[job.status] ?? { label: 'Sent', tone: 'neutral' as const };
                    const pct = job.recipients > 0 ? Math.round((job.sent / job.recipients) * 100) : 0;
                    return (
                      <li
                        key={job.id}
                        className="space-y-2 rounded-lg border border-stroke/70 bg-black/20 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                              <span className="text-xs text-ink-soft">{audienceLabel(job.audience)}</span>
                              <span className="font-num text-xs text-ink-faint">
                                {job.sent} / {job.recipients} sent
                                {job.failed > 0 ? ` · ${job.failed} failed` : ''}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-xs text-ink-soft">
                              {job.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                            </p>
                            <p className="text-[11px] text-ink-faint">
                              {job.status === 'scheduled' ? 'Scheduled for ' : 'Sent '}
                              <RelativeTime value={job.scheduledFor || job.createdAt} />
                            </p>
                          </div>
                          {job.status === 'scheduled' ? (
                            <Button variant="secondary" onClick={() => void cancelJob(job.id)}>
                              Cancel broadcast
                            </Button>
                          ) : null}
                        </div>
                        {job.status === 'sent' || job.status === 'sending' ? (
                          <div className="h-1.5 overflow-hidden rounded-pill bg-white/10">
                            <div className="h-full rounded-pill bg-mint" style={{ width: `${pct}%` }} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <aside className="glass-card space-y-3 rounded-lg p-4 xl:sticky xl:top-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm text-ink">Telegram preview</h2>
              <Button variant="secondary" onClick={() => setLightChat((v) => !v)}>
                {lightChat ? 'Dark chat' : 'Light chat'}
              </Button>
            </div>
            <p className="text-xs text-ink-faint">Sample buyer Asha (balance 12.50 USDT)</p>

            <div className={`rounded-[28px] border p-2.5 ${lightChat ? 'border-black/10 bg-[#d6e4ef]' : 'border-white/10 bg-[#0e1621]'}`}>
              <div className="flex items-center gap-2 border-b border-white/10 px-2 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-rose/40 text-xs text-ink">B</span>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${lightChat ? 'text-[#17212b]' : 'text-white'}`}>
                    {data.storeName || 'Black Tier Circle'}
                  </p>
                  <p className="text-[11px] text-[#6c9bd1]">bot</p>
                </div>
              </div>
              <div className="min-h-[360px] px-2 py-3">
                <div
                  className={`max-w-[300px] overflow-hidden rounded-2xl rounded-bl-md text-[13.5px] leading-relaxed ${
                    lightChat ? 'bg-white text-[#17212b]' : 'bg-[#182533] text-[#e9eef4]'
                  }`}
                >
                  {imageUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl.trim()} alt="" className="h-[132px] w-full object-cover" />
                  ) : null}
                  <div
                    className="px-3 py-2 break-words"
                    dangerouslySetInnerHTML={{ __html: telegramHtmlToEditorNodes(filledPreview || 'Write a message to preview.') }}
                  />
                  <p className="px-3 pb-2 text-right text-[11px] text-[#6d8296]">18:42</p>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-ink-faint">Rendered with the same Telegram HTML builder as Bot Studio</p>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
