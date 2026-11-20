'use client';

/**
 * @file app/(platform)/customers/view.tsx
 *
 * Customers directory, buyer detail drawer (orders, wallet, top-ups, flags),
 * support inbox with store-bot replies, and owner-only linked warranty replacement.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, ShieldAlert, Users, Wallet } from 'lucide-react';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  Pagination,
  RelativeTime,
  SelectField,
  Skeleton,
  StatTile,
  StatusPill,
  TextAreaField,
  TextField,
  type Column,
} from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import type { PeoplePayload, PersonDetail, PersonRow } from '@/modules/platform/people';
import type { SupportThread, SupportThreadDetail } from '@/modules/platform/support';

type PeopleApiPayload = PeoplePayload & {
  readonly role?: 'owner' | 'reseller';
};

type InboxPayload = {
  readonly needsMigration: boolean;
  readonly threads: readonly SupportThread[];
  readonly counts: { readonly all: number; readonly unread: number; readonly open: number; readonly closed: number };
  readonly role?: 'owner' | 'reseller';
};

type ThreadApiDetail = SupportThreadDetail & {
  readonly role?: 'owner' | 'reseller';
};

const STATE_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'blocked', label: 'Blocked' },
] as const;

const THREAD_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
] as const;

function BuyerDrawer({
  person,
  onOpenThread,
  onDone,
}: {
  readonly person: PersonDetail;
  readonly onOpenThread: (threadId: string) => void;
  readonly onDone: () => void;
}): JSX.Element {
  const [blockReason, setBlockReason] = useState('');
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockFeedback, setBlockFeedback] = useState('');
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAction, setWalletAction] = useState<'credit' | 'debit'>('credit');
  const [amountUsdt, setAmountUsdt] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletFeedback, setWalletFeedback] = useState('');

  async function toggleBlock(): Promise<void> {
    setBlockBusy(true);
    setBlockFeedback('');
    const nextBlocked = person.state !== 'blocked';
    const result = await runAction('/api/platform/people', {
      method: 'POST',
      body: {
        action: nextBlocked ? 'block' : 'unblock',
        customerId: person.id,
        reason: blockReason.trim() || undefined,
      },
    });
    setBlockBusy(false);
    if (result.ok) {
      setBlockReason('');
      setBlockFeedback(nextBlocked ? 'Buyer blocked.' : 'Buyer unblocked.');
      onDone();
    } else {
      setBlockFeedback(result.error.message);
    }
  }

  async function submitWallet(): Promise<void> {
    setWalletBusy(true);
    setWalletFeedback('');
    const result = await runAction('/api/platform/people', {
      method: 'POST',
      body: {
        action: walletAction,
        customerId: person.id,
        amountUsdt: amountUsdt.trim(),
        reason: walletReason.trim(),
      },
    });
    setWalletBusy(false);
    if (result.ok) {
      setAmountUsdt('');
      setWalletReason('');
      setWalletOpen(false);
      setWalletFeedback('Balance updated.');
      onDone();
    } else {
      setWalletFeedback(result.error.message);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-medium text-ink">{person.name}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {person.telegramId ? `Telegram ID ${person.telegramId} · ` : ''}Joined <RelativeTime value={person.joinedAt} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{person.storeName}</Badge>
          <StatusPill tone={person.state === 'blocked' ? 'fault' : 'ok'}>
            {person.state === 'blocked' ? 'Blocked' : 'Active'}
          </StatusPill>
        </div>
      </div>

      <div className="rounded-lg border border-stroke bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-ink-faint">Wallet & points</p>
            <p className="mt-0.5 font-num text-base font-medium text-ink">{person.wallet.balance}</p>
            <p className="text-xs text-ink-soft tabular-nums">{person.wallet.points} referral points</p>
          </div>
          <Button variant="secondary" onClick={() => setWalletOpen((open) => !open)}>
            {walletOpen ? 'Close adjustment' : 'Adjust credit'}
          </Button>
        </div>
        {walletFeedback ? <p className="mt-2 text-xs text-ink-soft">{walletFeedback}</p> : null}
        {walletOpen ? (
          <div className="mt-3 space-y-2 border-t border-stroke pt-3">
            <SelectField
              id="buyer-wallet-action"
              label="Action"
              value={walletAction}
              options={[
                { value: 'credit', label: 'Add credit' },
                { value: 'debit', label: 'Deduct credit' },
              ]}
              onChange={(event) => setWalletAction(event.target.value === 'debit' ? 'debit' : 'credit')}
            />
            <TextField
              id="buyer-wallet-amount"
              label="Amount (USDT)"
              placeholder="5.00"
              value={amountUsdt}
              onChange={(event) => setAmountUsdt(event.target.value)}
            />
            <TextField
              id="buyer-wallet-reason"
              label="Reason"
              placeholder="Goodwill adjustment or correction"
              value={walletReason}
              onChange={(event) => setWalletReason(event.target.value)}
            />
            <Button loading={walletBusy} onClick={() => void submitWallet()}>
              {walletAction === 'credit' ? 'Add credit' : 'Deduct credit'}
            </Button>
          </div>
        ) : null}
        {person.wallet.topups.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-t border-stroke pt-2.5">
            {person.wallet.topups.slice(0, 4).map((topup) => (
              <li key={topup.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-num text-ink">{topup.amount}</span>
                <div className="flex items-center gap-2">
                  <StatusPill tone={topup.rawStatus === 'credited' ? 'ok' : topup.rawStatus === 'pending' ? 'warn' : 'neutral'}>
                    {topup.status}
                  </StatusPill>
                  <RelativeTime value={topup.at} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Orders ({person.orders.length})</h3>
        {person.orders.length === 0 ? (
          <p className="text-xs text-ink-soft">No orders yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {person.orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2 rounded-md border border-stroke px-2.5 py-2">
                <div className="min-w-0">
                  <Link href={`/orders?order=${order.id}`} className="block truncate text-xs font-medium text-ink hover:underline">
                    #{order.shortId} · {order.productTitle}
                  </Link>
                  <p className="text-[11px] text-ink-faint">
                    Qty {order.quantity} · <RelativeTime value={order.at} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-num text-xs text-ink">{order.total}</span>
                  <StatusPill tone={order.tone}>{order.status}</StatusPill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Support threads ({person.supportThreads.length})</h3>
        {person.supportThreads.length === 0 ? (
          <p className="text-xs text-ink-soft">No support threads yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {person.supportThreads.map((thread) => (
              <li key={thread.id} className="rounded-md border border-stroke px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill tone={thread.unread ? 'warn' : thread.status === 'closed' ? 'neutral' : 'info'}>
                    {thread.unread ? 'Unread' : thread.statusLabel}
                  </StatusPill>
                  <span className="text-[11px] text-ink-faint">
                    <RelativeTime value={thread.lastMessageAt} />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink">{thread.preview || 'No message preview'}</p>
                <div className="mt-2">
                  <Button variant="secondary" onClick={() => onOpenThread(thread.id)}>
                    Open in inbox
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Flags & safety ({person.flags.length})</h3>
        {person.flags.length === 0 ? (
          <p className="text-xs text-ink-soft">No flags on this account.</p>
        ) : (
          <ul className="space-y-1.5">
            {person.flags.slice(0, 6).map((flag) => (
              <li key={flag.id} className="rounded-md border border-stroke px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill tone={flag.severity}>{flag.label}</StatusPill>
                  <span className="text-[11px] text-ink-faint">
                    <RelativeTime value={flag.at} />
                  </span>
                </div>
                <p className="mt-1 break-words text-xs text-ink-soft">{flag.reason}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 rounded-lg border border-stroke p-3">
          <TextField
            id="buyer-block-reason"
            label={person.state === 'blocked' ? 'Unblock note' : 'Block reason'}
            placeholder={person.state === 'blocked' ? 'Optional note' : 'Reason for blocking this buyer'}
            value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)}
          />
          {blockFeedback ? <p className="text-xs text-ink-soft">{blockFeedback}</p> : null}
          <Button
            variant={person.state === 'blocked' ? 'secondary' : 'destructive'}
            loading={blockBusy}
            onClick={() => void toggleBlock()}
          >
            {person.state === 'blocked' ? 'Unblock buyer' : 'Block buyer'}
          </Button>
        </div>
      </div>

      {person.referrals.length > 0 ? (
        <p className="text-xs text-ink-soft">Invited buyers: {person.referrals.join(', ')}</p>
      ) : null}
    </div>
  );
}

function SupportInbox({
  threadId,
  onSelectThread,
  onSelectPerson,
  onInboxChanged,
}: {
  readonly threadId: string;
  readonly onSelectThread: (id: string) => void;
  readonly onSelectPerson: (personId: string) => void;
  readonly onInboxChanged: () => void;
}): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'open' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState('');

  const [replaceOrderId, setReplaceOrderId] = useState('');
  const [replaceMode, setReplaceMode] = useState<'manual' | 'supplier'>('manual');
  const [replaceContent, setReplaceContent] = useState('');
  const [replaceReason, setReplaceReason] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceFeedback, setReplaceFeedback] = useState('');

  const inbox = useData<InboxPayload>(
    `/api/platform/support?status=${encodeURIComponent(statusFilter)}&q=${encodeURIComponent(search)}`,
  );
  const thread = useData<ThreadApiDetail>(
    threadId ? `/api/platform/support?thread=${encodeURIComponent(threadId)}` : null,
  );

  const selectedDelivered = thread.data?.deliveredOrders ?? [];
  const activeOrder = selectedDelivered.find((item) => item.id === replaceOrderId) ?? selectedDelivered[0] ?? null;

  useEffect(() => {
    setReplyFeedback('');
    setReplaceFeedback('');
    setConfirmReplace(false);
    setReplaceContent('');
    setReplaceReason('');
    setReplaceOrderId('');
  }, [threadId]);

  useEffect(() => {
    if (activeOrder && !activeOrder.hasSupplier && replaceMode === 'supplier') {
      setReplaceMode('manual');
    }
  }, [activeOrder, replaceMode]);

  async function sendReply(): Promise<void> {
    if (!threadId || !reply.trim()) return;
    setSending(true);
    setReplyFeedback('');
    const result = await runAction<{ readonly messageId: string; readonly sent: boolean }>('/api/platform/support', {
      method: 'POST',
      body: { threadId, body: reply },
    });
    setSending(false);
    if (!result.ok) {
      setReplyFeedback(result.error.message);
      return;
    }
    setReply('');
    setReplyFeedback(result.data.sent ? 'Reply sent via store bot.' : 'Saved reply, but bot delivery failed. Use Retry send.');
    thread.refetch();
    inbox.refetch();
    onInboxChanged();
  }

  async function toggleThreadStatus(nextStatus: 'open' | 'closed'): Promise<void> {
    if (!threadId) return;
    setStatusBusy(true);
    const result = await runAction('/api/platform/support', {
      method: 'PATCH',
      body: { threadId, status: nextStatus },
    });
    setStatusBusy(false);
    if (result.ok) {
      thread.refetch();
      inbox.refetch();
      onInboxChanged();
    } else {
      setReplyFeedback(result.error.message);
    }
  }

  async function submitReplacement(): Promise<void> {
    if (!activeOrder || !threadId) return;
    setReplaceBusy(true);
    setReplaceFeedback('');
    const result = await runAction('/api/platform/replacements', {
      method: 'POST',
      body: {
        decision: 'replace',
        orderId: activeOrder.id,
        mode: replaceMode,
        ...(replaceMode === 'manual' ? { content: replaceContent } : {}),
        ...(replaceReason.trim() ? { note: replaceReason.trim() } : {}),
        threadId,
      },
    });
    setReplaceBusy(false);
    if (!result.ok) {
      setReplaceFeedback(result.error.message);
      return;
    }
    setConfirmReplace(false);
    setReplaceContent('');
    setReplaceReason('');
    setReplaceFeedback('Replacement delivered and recorded in this thread.');
    thread.refetch();
    inbox.refetch();
    onInboxChanged();
  }

  if (inbox.loading && !inbox.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (inbox.error) {
    return <ErrorState message={inbox.error.message} onRetry={inbox.refetch} />;
  }

  const threads = inbox.data?.threads ?? [];
  const counts = inbox.data?.counts ?? { all: 0, unread: 0, open: 0, closed: 0 };
  const activeThread = thread.data?.thread ?? null;
  const isOwner = (thread.data?.role ?? inbox.data?.role) === 'owner';

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[340px_1fr]">
      <Card title="Conversations">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {THREAD_CHIPS.map((chip) => {
              const count = counts[chip.id];
              const active = statusFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setStatusFilter(chip.id)}
                  className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs transition ${
                    active ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span className="tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
          <TextField
            id="support-search"
            label="Filter threads"
            placeholder="Buyer username or message"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {threads.length === 0 ? (
            <EmptyState
              title="No matching threads"
              message="Support threads appear automatically when a buyer writes to your bot."
            />
          ) : (
            <ul className="max-h-[540px] space-y-2 overflow-y-auto pr-0.5">
              {threads.map((item) => {
                const selected = item.id === threadId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectThread(item.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        selected
                          ? 'border-rose/60 bg-rose/10'
                          : 'border-stroke bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{item.customerName}</span>
                        <StatusPill tone={item.unread ? 'warn' : item.status === 'closed' ? 'neutral' : 'ok'}>
                          {item.unread ? 'Unread' : item.statusLabel}
                        </StatusPill>
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-xs text-ink-soft">
                        {item.preview || 'No messages yet'}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-faint">
                        <span className="truncate">{item.storeName}</span>
                        <RelativeTime value={item.lastMessageAt} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        {!threadId ? (
          <Card>
            <EmptyState
              title="Select a conversation"
              message="Pick a buyer thread on the left to read messages, reply via the store bot, or send a replacement."
            />
          </Card>
        ) : thread.loading && !thread.data ? (
          <Card>
            <Skeleton className="h-48 w-full" />
          </Card>
        ) : thread.error ? (
          <ErrorState message={thread.error.message} onRetry={thread.refetch} />
        ) : !activeThread ? (
          <Card>
            <EmptyState title="Thread not found" message="This conversation is unavailable in your workspace." />
          </Card>
        ) : (
          <>
            <Card
              title={activeThread.customerName}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{activeThread.storeName}</Badge>
                  <StatusPill tone={activeThread.status === 'closed' ? 'neutral' : 'ok'}>
                    {activeThread.statusLabel}
                  </StatusPill>
                  {activeThread.status === 'open' ? (
                    <Button variant="secondary" loading={statusBusy} onClick={() => void toggleThreadStatus('closed')}>
                      Close thread
                    </Button>
                  ) : (
                    <Button variant="secondary" loading={statusBusy} onClick={() => void toggleThreadStatus('open')}>
                      Reopen thread
                    </Button>
                  )}
                </div>
              }
            >
              {thread.data?.customer ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke bg-white/[0.02] px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-ink-soft">
                      Balance: <strong className="font-num text-ink">{thread.data.customer.balance}</strong>
                    </span>
                    <StatusPill tone={thread.data.customer.state === 'blocked' ? 'fault' : 'ok'}>
                      {thread.data.customer.state === 'blocked' ? 'Blocked' : 'Active'}
                    </StatusPill>
                    {thread.data.customer.blockedReason ? (
                      <span className="text-ink-soft">{thread.data.customer.blockedReason}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-rose hover:underline"
                    onClick={() => onSelectPerson(thread.data!.customer!.id)}
                  >
                    View buyer profile
                  </button>
                </div>
              ) : null}

              <div className="max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
                {(thread.data?.messages ?? []).map((message) => {
                  const fromStore = message.sender === 'owner';
                  return (
                    <div key={message.id} className={`flex flex-col ${fromStore ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                          fromStore
                            ? 'border-rose/35 bg-rose/10 text-ink'
                            : 'border-stroke bg-white/[0.04] text-ink'
                        }`}
                      >
                        <p className="mb-1 text-[11px] text-ink-soft">
                          {fromStore ? 'Store' : activeThread.customerName} · <RelativeTime value={message.at} />
                        </p>
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        {message.failed ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stroke/60 pt-1.5">
                            <span className="text-xs" style={{ color: 'var(--fault-ink)' }}>
                              Delivery to Telegram failed.
                            </span>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                void runAction('/api/platform/support', {
                                  method: 'POST',
                                  body: { threadId, messageId: message.id, body: message.body },
                                }).then(() => {
                                  thread.refetch();
                                  inbox.refetch();
                                });
                              }}
                            >
                              Retry send
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 space-y-3 border-t border-stroke pt-4">
                <TextAreaField
                  id="support-reply"
                  label="Reply through store bot"
                  placeholder="Write your reply to this buyer..."
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
                {replyFeedback ? <p className="text-xs text-ink-soft">{replyFeedback}</p> : null}
                <Button loading={sending} disabled={!reply.trim()} onClick={() => void sendReply()}>
                  Send reply
                </Button>
              </div>
            </Card>

            {isOwner ? (
              <Card title="Warranty replacement (owner only)">
                <div className="space-y-3">
                  <p className="text-xs text-ink-soft">
                    Replacements are owner-only, never charged to the buyer, logged to audit history, and linked directly to this support thread.
                  </p>
                  {selectedDelivered.length === 0 ? (
                    <p className="text-xs text-ink-soft">No delivered orders found for this buyer yet.</p>
                  ) : (
                    <>
                      <SelectField
                        id="replace-order-select"
                        label="Delivered order"
                        value={activeOrder?.id ?? ''}
                        options={selectedDelivered.map((order) => ({
                          value: order.id,
                          label: `#${order.shortId} · ${order.productTitle} (${order.total})${order.hasOpenReplacement ? ' — Open replacement' : ''}`,
                        }))}
                        onChange={(event) => {
                          setReplaceOrderId(event.target.value);
                          setConfirmReplace(false);
                        }}
                      />
                      <SelectField
                        id="replace-mode-select"
                        label="Replacement source"
                        value={replaceMode}
                        options={[
                          { value: 'manual', label: 'Paste replacement item manually' },
                          ...(activeOrder?.hasSupplier ? [{ value: 'supplier', label: 'Order fresh item from supplier' }] : []),
                        ]}
                        onChange={(event) => {
                          setReplaceMode(event.target.value === 'supplier' ? 'supplier' : 'manual');
                          setConfirmReplace(false);
                        }}
                      />
                      {replaceMode === 'manual' ? (
                        <TextAreaField
                          id="replace-manual-content"
                          label="Replacement key or credentials"
                          placeholder="Paste the replacement item to deliver via Telegram..."
                          value={replaceContent}
                          onChange={(event) => setReplaceContent(event.target.value)}
                        />
                      ) : null}
                      <TextField
                        id="replace-reason-note"
                        label="Reason (recorded in audit log & thread)"
                        placeholder="Key already redeemed — warranty replacement"
                        value={replaceReason}
                        onChange={(event) => setReplaceReason(event.target.value)}
                      />
                      {replaceFeedback ? <p className="text-xs text-ink-soft">{replaceFeedback}</p> : null}
                      {activeOrder?.hasOpenReplacement ? (
                        <p className="text-xs" style={{ color: 'var(--warn)' }}>
                          This order already has an active replacement request.
                        </p>
                      ) : !confirmReplace ? (
                        <Button
                          variant="secondary"
                          disabled={replaceReason.trim().length < 5 || (replaceMode === 'manual' && !replaceContent.trim())}
                          onClick={() => setConfirmReplace(true)}
                        >
                          Prepare replacement
                        </Button>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-amber/40 bg-amber/10 p-3">
                          <p className="text-xs text-ink">
                            Send this free warranty replacement for order <strong>#{activeOrder?.shortId}</strong> via{' '}
                            <strong>{replaceMode === 'supplier' ? 'supplier API' : 'manual paste'}</strong> and post confirmation in this support thread?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button loading={replaceBusy} onClick={() => void submitReplacement()}>
                              Confirm replace
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {(thread.data?.replacements ?? []).length > 0 ? (
                    <div className="space-y-1.5 border-t border-stroke pt-3">
                      <p className="text-xs font-medium text-ink-faint">Past replacements for this buyer</p>
                      <ul className="space-y-1.5">
                        {(thread.data?.replacements ?? []).map((rep) => (
                          <li key={rep.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stroke px-2.5 py-1.5 text-xs">
                            <span className="truncate text-ink">
                              #{rep.shortId} · {rep.reason}
                            </span>
                            <div className="flex items-center gap-2">
                              <StatusPill tone={rep.status === 'Replaced' ? 'ok' : rep.status === 'Declined' ? 'fault' : 'warn'}>
                                {rep.status}
                              </StatusPill>
                              <RelativeTime value={rep.at} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function CustomersView(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setDrawer = useSetDrawerBody();

  const tab = params.get('tab') === 'support' ? 'support' : 'buyers';
  const q = params.get('q') ?? '';
  const stateFilter = params.get('state') ?? 'all';
  const page = params.get('page') ?? '1';
  const pageSize = params.get('pageSize') ?? '24';
  const personId = params.get('person') ?? '';
  const threadId = params.get('thread') ?? '';

  const people = useData<PeopleApiPayload>(
    `/api/platform/people?type=buyer&q=${encodeURIComponent(q)}&state=${encodeURIComponent(stateFilter)}&page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
  );
  const detail = useData<{ readonly person: PersonDetail | null }>(
    personId ? `/api/platform/people/detail?id=${encodeURIComponent(personId)}&kind=buyer` : null,
  );

  function updateParams(changes: Record<string, string | null>): void {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `/customers?${qs}` : '/customers');
  }

  const { data: detailData, loading: detailLoading, error: detailError, refetch: refetchDetail } = detail;
  const { refetch: refetchPeople } = people;
  const paramsKey = params.toString();

  useEffect(() => {
    if (!personId) {
      setDrawer(null);
      return;
    }
    const person = detailData?.person ?? null;
    setDrawer(
      detailLoading ? (
        <p className="text-sm text-ink-soft">Loading buyer details…</p>
      ) : detailError ? (
        <ErrorState message={detailError.message} onRetry={refetchDetail} />
      ) : person ? (
        <BuyerDrawer
          person={person}
          onOpenThread={(tid) => {
            const next = new URLSearchParams(paramsKey);
            next.set('tab', 'support');
            next.set('thread', tid);
            next.delete('person');
            router.replace(`/customers?${next.toString()}`);
          }}
          onDone={() => {
            refetchDetail();
            refetchPeople();
          }}
        />
      ) : (
        <p className="text-sm text-ink-soft">This buyer was not found.</p>
      ),
    );
    return () => setDrawer(null);
  }, [personId, detailData, detailLoading, detailError, refetchDetail, refetchPeople, setDrawer, paramsKey, router]);

  const summary = people.data?.summary ?? {
    totalBuyers: 0,
    activeBuyers: 0,
    blockedBuyers: 0,
    unreadSupport: 0,
    flaggedBuyers: 0,
    totalBalance: '0.00 USDT',
  };

  const columns: Column<PersonRow>[] = [
    {
      id: 'name',
      header: 'Buyer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-faint">{row.storeName}</p>
        </div>
      ),
    },
    { id: 'balance', header: 'Wallet', numeric: true, render: (row) => row.balance },
    {
      id: 'orders',
      header: 'Orders',
      numeric: true,
      render: (row) => (
        <div className="text-right">
          <p className="tabular-nums text-ink">{row.orders}</p>
          <p className="font-num text-[11px] text-ink-faint">{row.spent}</p>
        </div>
      ),
    },
    {
      id: 'support',
      header: 'Support & flags',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {row.unreadSupport ? (
            <StatusPill tone="warn">Unread</StatusPill>
          ) : row.openThreads > 0 ? (
            <StatusPill tone="info">{row.openThreads} open</StatusPill>
          ) : (
            <span className="text-xs text-ink-faint">None</span>
          )}
          {row.flagged ? <StatusPill tone="fault">Flagged</StatusPill> : null}
        </div>
      ),
    },
    {
      id: 'seen',
      header: 'Last seen',
      render: (row) => (row.lastSeen ? <RelativeTime value={row.lastSeen} /> : 'Unknown time'),
    },
    {
      id: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={row.state === 'blocked' ? 'fault' : 'ok'}>
          {row.state === 'blocked' ? 'Blocked' : 'Active'}
        </StatusPill>
      ),
    },
  ];

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">Customers</h1>
          <p className="mt-1 text-sm text-ink-soft">Buyers, wallets, safety flags, and bot support threads.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateParams({ tab: null, thread: null })}
            className={`inline-flex h-10 items-center rounded-pill px-4 text-sm font-medium transition ${
              tab === 'buyers' ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
            }`}
          >
            Buyers
          </button>
          <button
            type="button"
            onClick={() => updateParams({ tab: 'support', person: null })}
            className={`inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-medium transition ${
              tab === 'support' ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
            }`}
          >
            <span>Support inbox</span>
            {summary.unreadSupport > 0 ? (
              <span className="rounded-pill bg-amber/25 px-2 py-0.5 text-xs tabular-nums text-ink">
                {summary.unreadSupport}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatTile label="Total buyers" value={String(summary.totalBuyers)} icon={Users} tone="rose" />
        <StatTile
          label="Unread support"
          value={String(summary.unreadSupport)}
          icon={MessageSquare}
          tone={summary.unreadSupport > 0 ? 'amber' : 'mint'}
        />
        <StatTile label="Buyer balances" value={summary.totalBalance} icon={Wallet} tone="sky" />
        <StatTile
          label="Flagged & blocked"
          value={String(summary.flaggedBuyers)}
          icon={ShieldAlert}
          tone={summary.flaggedBuyers > 0 ? 'danger' : 'mint'}
        />
      </div>

      {tab === 'support' ? (
        <SupportInbox
          threadId={threadId}
          onSelectThread={(tid) => updateParams({ tab: 'support', thread: tid, person: null })}
          onSelectPerson={(pid) => updateParams({ tab: 'buyers', person: pid, thread: null })}
          onInboxChanged={() => refetchPeople()}
        />
      ) : (
        <div className="min-w-0 space-y-4">
          <FilterBar>
            <TextField
              id="customers-search"
              label="Search buyers"
              placeholder="Username, name, or Telegram ID"
              value={q}
              onChange={(event) => updateParams({ q: event.target.value || null, page: null })}
            />
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {STATE_CHIPS.map((chip) => {
                const active = stateFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => updateParams({ state: chip.id === 'all' ? null : chip.id, page: null })}
                    className={`inline-flex h-10 items-center rounded-pill px-3.5 text-xs font-medium transition ${
                      active ? 'bg-rose text-white' : 'border border-stroke text-ink-soft hover:text-ink'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </FilterBar>

          {people.loading && !people.data ? <Skeleton className="h-64 w-full" /> : null}
          {people.error ? <ErrorState message={people.error.message} onRetry={people.refetch} /> : null}
          {people.data ? (
            <>
              <DataTable
                caption="Buyers"
                columns={columns}
                rows={people.data.rows}
                rowKey={(row) => row.id}
                emptyTitle="No buyers match"
                emptyMessage="Try clearing the search or filter."
                onOpen={(row) => updateParams({ person: row.id })}
              />
              <Pagination
                page={people.data.page}
                pageSize={people.data.pageSize}
                total={people.data.total}
                onPage={(next) => updateParams({ page: String(next) })}
                onPageSize={(size) => updateParams({ pageSize: String(size), page: null })}
              />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
