'use client';

/**
 * Bot operations. A reseller only receives their own bots from the API.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkline } from '@/components/platform/ui/charts';
import { Button, ErrorState, RelativeTime, Skeleton, StatusPill, TextField } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES } from '@/lib/navigation';
import type { BotCard, BotDetail } from '@/modules/platform/bots-desk';

type ListPayload = { readonly bots: readonly BotCard[] };
type DetailPayload = { readonly bot: BotDetail | null };

function BotsView(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const botId = params.get('bot');
  const list = useData<ListPayload>('/api/platform/bots');
  const detail = useData<DetailPayload>(botId ? `/api/platform/bots?bot=${encodeURIComponent(botId)}` : null);
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState('');
  const role = list.data?.bots.some((bot) => bot.id === 'owner') ? 'owner' : 'reseller';

  function open(id: string): void {
    const next = new URLSearchParams(params.toString());
    next.set('bot', id);
    router.replace(`/bots?${next.toString()}`);
  }

  async function act(action: 'pause' | 'resume' | 'disconnect', id: string): Promise<void> {
    const result = await runAction('/api/platform/bots', { body: { action, botId: id } });
    setNotice(result.ok ? 'Saved.' : result.error.message);
    if (result.ok) {
      list.refetch();
      detail.refetch();
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Bots</h1>
          <p className="mt-1 text-sm text-ink-soft">{role === 'owner' ? 'Every bot on the platform.' : 'Your store bot.'}</p>
        </div>
      </header>
      {list.loading && !list.data ? <Skeleton className="h-40 w-full" /> : null}
      {list.error && !list.data ? <ErrorState message={list.error.message} requestId={list.error.requestId} detail={list.error.detail} onRetry={list.refetch} /> : null}
      {notice ? <p className="text-sm text-ink">{notice}</p> : null}
      <form className="glass-card flex flex-wrap items-end gap-2 rounded-lg p-4" onSubmit={(event) => { event.preventDefault(); void runAction(role === 'owner' ? API_ROUTES.ownerSettingsBotConnect : API_ROUTES.botsConnect, { body: { botToken: token } }).then((result) => { setNotice(result.ok ? 'The bot is connected.' : result.error.message); if (result.ok) { setToken(''); list.refetch(); } }); }}>
        <TextField id="bot-token" label="Bot token" type="password" value={token} onChange={(event) => setToken(event.target.value)} />
        <Button type="submit" disabled={token.trim().length < 8}>Connect a bot</Button>
      </form>
      {list.data && list.data.bots.length === 0 ? <p className="text-sm text-ink-soft">No bot is connected yet. Paste a token from BotFather.</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {(list.data?.bots ?? []).map((bot) => (
          <article key={bot.id} className="glass-card space-y-2 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="text-left" onClick={() => open(bot.id)}>
                <p className="text-sm text-ink">@{bot.username || 'unnamed'}</p>
                <p className="text-xs text-ink-faint">{bot.store} · {bot.owner}</p>
              </button>
              <StatusPill tone={bot.status === 'connected' ? 'ok' : bot.status === 'paused' ? 'warn' : 'fault'}>{bot.status}</StatusPill>
            </div>
            <p className="text-xs text-ink-soft">Token {bot.tokenValid === null ? 'not checked on this card' : bot.tokenValid ? 'valid via getMe' : 'not valid'} · Webhook {bot.webhookSet === null ? 'stored from the last check' : bot.webhookSet ? 'set' : 'not set'} · Pending {bot.pendingUpdates ?? '—'}</p>
            <p className="text-xs text-ink-faint">Last update {bot.lastUpdate ? <RelativeTime value={bot.lastUpdate} /> : 'never'}</p>
            <p className="font-num text-sm text-ink">{bot.orders} orders · {bot.revenue} USDT · {bot.buyers} buyers · {bot.conversion}</p>
            <Sparkline data={bot.sparkline.some((value) => value > 0) ? bot.sparkline : [0, 0]} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => open(bot.id)}>Open</Button>
              <Button variant="secondary" onClick={() => void act(bot.status === 'paused' ? 'resume' : 'pause', bot.id)}>{bot.status === 'paused' ? 'Resume bot' : 'Pause bot'}</Button>
              <Button variant="secondary" onClick={() => { void runAction('/api/platform/store', { method: 'POST' }).then((result) => setNotice(result.ok ? 'Webhook registered again.' : result.error.message)); }}>Re-set webhook</Button>
              <Button variant="destructive" onClick={() => void act('disconnect', bot.id)}>Disconnect</Button>
            </div>
          </article>
        ))}
      </div>
      {botId ? (
        <article className="glass-card space-y-3 rounded-lg p-4">
          <h2 className="text-sm text-ink">Bot detail</h2>
          {detail.loading && !detail.data ? <Skeleton className="h-24 w-full" /> : null}
          {detail.error ? <ErrorState message={detail.error.message} onRetry={detail.refetch} /> : null}
          {detail.data && !detail.data.bot ? <p className="text-sm text-ink-soft">This bot is not in your account.</p> : null}
          {detail.data?.bot ? (
            <>
              <p className="text-sm text-ink">Token {detail.data.bot.tokenValid ? 'valid via getMe' : 'not valid'} · Webhook {detail.data.bot.webhookSet ? 'set' : 'not set'} · Pending updates {detail.data.bot.pendingUpdates ?? 0}</p>
              <h3 className="text-xs text-ink-faint">Orders</h3>
              {detail.data.bot.ordersList.length === 0 ? <p className="text-sm text-ink-soft">No recent orders.</p> : null}
              <ul className="space-y-1">
                {detail.data.bot.ordersList.map((order) => (
                  <li key={order.id} className="flex justify-between gap-2 text-sm"><span className="font-mono text-ink">{order.id.slice(0, 8)}</span><span className="text-ink-soft">{order.status} · {order.total} · <RelativeTime value={order.at} /></span></li>
                ))}
              </ul>
              <h3 className="text-xs text-ink-faint">Buyers</h3>
              {detail.data.bot.buyersList.length === 0 ? <p className="text-sm text-ink-soft">No buyers yet.</p> : null}
              <ul>{detail.data.bot.buyersList.map((buyer) => <li key={buyer.id} className="text-sm text-ink">{buyer.name}</li>)}</ul>
              <h3 className="text-xs text-ink-faint">Errors and webhook log</h3>
              {detail.data.bot.errors.length === 0 ? <p className="text-sm text-ink-soft">No webhook error on the last getMe and getWebhookInfo check.</p> : null}
              <ul>{detail.data.bot.errors.map((error) => <li key={error} className="text-sm text-ink">{error}</li>)}</ul>
            </>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

export default function BotsPage(): JSX.Element {
  return (
    <Suspense fallback={<p className="text-sm text-ink-soft">Loading bots…</p>}>
      <BotsView />
    </Suspense>
  );
}
