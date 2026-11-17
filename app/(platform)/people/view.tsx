'use client';

/**
 * People. Buyers, resellers, and the support inbox share one directory.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSetDrawerBody } from '@/components/platform/drawer-body';
import { Button, Card, DataTable, EmptyState, ErrorState, FilterBar, Pagination, SelectField, StatusPill, TextAreaField, TextField, type Column } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { PersonRow } from '@/modules/platform/people';
import type { SupportMessage, SupportThread } from '@/modules/platform/support';

type PeoplePayload = {
  readonly rows: readonly PersonRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};

type PersonDetail = {
  readonly name: string;
  readonly state: string;
  readonly balance: string;
  readonly orders: readonly { readonly id: string; readonly total: string; readonly at: string }[];
  readonly referrals: readonly string[];
  readonly threads: readonly string[];
};

type Inbox = {
  readonly needsMigration: boolean;
  readonly threads: readonly SupportThread[];
};

type ThreadDetail = {
  readonly needsMigration: boolean;
  readonly thread: SupportThread | null;
  readonly messages: readonly SupportMessage[];
};

function ThreadPanel({ threadId, data, onDone }: { readonly threadId: string; readonly data: ThreadDetail; readonly onDone: () => void }): JSX.Element {
  const [reply, setReply] = useState('');
  if (data.needsMigration) {
    return <p className="text-sm text-ink">Support needs migration 0032.</p>;
  }
  if (!data.thread) {
    return <p className="text-sm text-ink-soft">This thread was not found.</p>;
  }
  return (
    <div className="space-y-3">
      <h2 className="text-lg text-ink">Thread</h2>
      <ul className="space-y-2">
        {data.messages.map((message) => (
          <li key={message.id} className="rounded-md border border-stroke px-3 py-2 text-sm">
            <p className="text-ink-soft">{message.sender === 'owner' ? 'Store' : 'Buyer'} · {message.at}</p>
            <p className="text-ink">{message.body}</p>
            {message.failed ? <p style={{ color: 'var(--fault-ink)' }}>This reply did not reach Telegram. Retry it.</p> : null}
            {message.failed ? (
              <Button variant="secondary" onClick={() => { void runAction('/api/platform/support', { method: 'POST', body: { threadId, messageId: message.id, body: message.body } }).then(onDone); }}>Retry send</Button>
            ) : null}
          </li>
        ))}
      </ul>
      <TextAreaField id="support-reply" label="Reply" value={reply} onChange={(event) => setReply(event.target.value)} />
      <Button onClick={() => { void runAction('/api/platform/support', { method: 'POST', body: { threadId, body: reply } }).then(() => { setReply(''); onDone(); }); }}>Send reply</Button>
    </div>
  );
}

function PersonPanel({ personId, kind, person, onDone }: { readonly personId: string; readonly kind: string; readonly person: PersonDetail; readonly onDone: () => void }): JSX.Element {
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-lg text-ink">{person.name}</h2>
      <p className="text-ink">Balance {person.balance}</p>
      <p className="text-ink-soft">State {person.state}</p>
      {kind !== 'reseller' ? (
        <div className="space-y-2">
          <TextField id="block-reason" label="Reason" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button variant="destructive" onClick={() => { void runAction('/api/platform/people', { method: 'POST', body: { customerId: personId, blocked: person.state !== 'blocked', reason: note } }).then(onDone); }}>{person.state === 'blocked' ? 'Unblock buyer' : 'Block buyer'}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { void runAction(API_ROUTES.resellerStatus(personId), { method: 'PATCH', body: { status: 'active' } }).then(onDone); }}>Approve reseller</Button>
          <Button variant="secondary" onClick={() => { void runAction(API_ROUTES.resellerStatus(personId), { method: 'PATCH', body: { status: 'suspended' } }).then(onDone); }}>Suspend reseller</Button>
        </div>
      )}
      {person.orders.length > 0 ? (
        <ul>{person.orders.map((order) => <li key={order.id} className="font-num text-ink">{order.total} · {order.at}</li>)}</ul>
      ) : <p className="text-ink-soft">No orders yet.</p>}
      {person.referrals.length > 0 ? <p className="text-ink">Referrals: {person.referrals.join(', ')}</p> : null}
      {person.threads.length > 0 ? <p className="text-ink-soft">{person.threads.length} support threads</p> : null}
    </div>
  );
}

export function PeopleView(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setDrawer = useSetDrawerBody();
  const type = params.get('type') ?? 'buyer';
  const q = params.get('q') ?? '';
  const page = params.get('page') ?? '1';
  const pageSize = params.get('pageSize') ?? '24';
  const personId = params.get('person') ?? '';
  const threadId = params.get('thread') ?? '';
  const [invite, setInvite] = useState('');
  const people = useData<PeoplePayload>(`/api/platform/people?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
  const detail = useData<{ person: PersonDetail | null }>(personId ? `/api/platform/people/detail?id=${encodeURIComponent(personId)}&kind=${encodeURIComponent(type === 'reseller' ? 'reseller' : 'buyer')}` : null);
  const inbox = useData<Inbox>('/api/platform/support');
  const thread = useData<ThreadDetail>(threadId ? `/api/platform/support?thread=${encodeURIComponent(threadId)}` : null);

  function setFilter(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page' && key !== 'person' && key !== 'thread') next.delete('page');
    router.replace(`${ROUTES.platform.people}?${next}`);
  }

  const { data: detailData, loading: detailLoading, error: detailError, refetch: refetchDetail } = detail;
  const { data: threadData, loading: threadLoading, error: threadError, refetch: refetchThread } = thread;
  const { refetch: refetchPeople } = people;
  const { refetch: refetchInbox } = inbox;

  useEffect(() => {
    if (threadId) {
      setDrawer(
        threadLoading ? <p className="text-sm text-ink-soft">Loading this thread…</p>
          : threadError ? <ErrorState message={threadError.message} onRetry={refetchThread} />
            : threadData ? <ThreadPanel threadId={threadId} data={threadData} onDone={() => { refetchThread(); refetchInbox(); }} />
              : <p className="text-sm text-ink-soft">This thread was not found.</p>,
      );
      return () => setDrawer(null);
    }
    if (!personId) {
      setDrawer(null);
      return;
    }
    const person = detailData?.person ?? null;
    setDrawer(
      detailLoading ? <p className="text-sm text-ink-soft">Loading this person…</p>
        : detailError ? <ErrorState message={detailError.message} onRetry={refetchDetail} />
          : person ? <PersonPanel personId={personId} kind={type} person={person} onDone={() => { refetchDetail(); refetchPeople(); }} />
            : <p className="text-sm text-ink-soft">This person was not found.</p>,
    );
    return () => setDrawer(null);
  }, [threadId, personId, type, detailData, detailLoading, detailError, refetchDetail, threadData, threadLoading, threadError, refetchThread, refetchPeople, refetchInbox, setDrawer]);

  const columns: Column<PersonRow>[] = [
    { id: 'name', header: 'Name', render: (row) => row.name },
    { id: 'balance', header: 'Balance', numeric: true, render: (row) => row.balance },
    { id: 'orders', header: 'Orders', numeric: true, render: (row) => String(row.orders) },
    { id: 'seen', header: 'Last seen', render: (row) => row.lastSeen },
    { id: 'state', header: 'State', render: (row) => <StatusPill tone={row.state === 'blocked' || row.state === 'suspended' ? 'fault' : row.state === 'pending' ? 'warn' : 'ok'}>{row.state}</StatusPill> },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl text-ink">People</h1>
        <p className="mt-1 text-sm text-ink-soft">Buyers, resellers, and support.</p>
      </header>
      <FilterBar>
        <TextField id="people-search" label="Search" value={q} onChange={(event) => setFilter('q', event.target.value)} />
        <SelectField id="people-type" label="Type" value={type} options={[{ value: 'buyer', label: 'Buyers' }, { value: 'reseller', label: 'Resellers' }]} onChange={(event) => setFilter('type', event.target.value)} />
      </FilterBar>
      {type === 'reseller' ? (
        <Card title="Invite a reseller">
          <div className="flex flex-wrap items-end gap-2">
            <TextField id="invite-email" label="Email" value={invite} onChange={(event) => setInvite(event.target.value)} />
            <Button onClick={() => { void runAction(API_ROUTES.invitationsCreate, { method: 'POST', body: { email: invite } }).then(() => setInvite('')); }}>Send invite</Button>
          </div>
        </Card>
      ) : null}
      {people.loading ? <p className="text-sm text-ink-soft">Loading people…</p> : null}
      {people.error ? <ErrorState message={people.error.message} onRetry={people.refetch} /> : null}
      {people.data ? (
        <>
          <DataTable caption="People" columns={columns} rows={people.data.rows} rowKey={(row) => row.id} emptyTitle="No one matches" emptyMessage="Change the search or invite a reseller." onOpen={(row) => setFilter('person', row.id)} />
          <Pagination page={people.data.page} pageSize={people.data.pageSize} total={people.data.total} onPage={(next) => setFilter('page', String(next))} onPageSize={(size) => setFilter('pageSize', String(size))} />
        </>
      ) : null}
      <Card title="Support">
        {inbox.data?.needsMigration ? <p className="text-sm text-ink">Support needs migration 0032.</p> : null}
        {inbox.error ? <ErrorState message={inbox.error.message} onRetry={inbox.refetch} /> : null}
        {inbox.data && inbox.data.threads.length === 0 && !inbox.data.needsMigration ? <EmptyState title="No support threads" message="A thread appears when a buyer taps Support in the bot." /> : null}
        <ul className="space-y-2">
          {(inbox.data?.threads ?? []).map((item) => (
            <li key={item.id}>
              <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm" onClick={() => setFilter('thread', item.id)}>
                <span className="text-ink">{item.preview || 'No message yet'}</span>
                {item.unread ? <StatusPill tone="warn">Unread</StatusPill> : <span className="text-ink-soft">{item.status}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
