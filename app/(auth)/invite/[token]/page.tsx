/**
 * @file app/(auth)/invite/[token]/page.tsx
 *
 * Invitation acceptance page stub.
 *
 * The token is displayed only as a presence indicator. Redemption
 * against the invitations table is added in Phase 1.
 *
 * @module Auth
 */

type InvitePageProps = {
  readonly params: { readonly token: string };
};

export default function InvitePage({ params }: InvitePageProps): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Invitation</h1>
      <p className="text-zinc-400">Token received. Acceptance is stubbed in Phase 0.</p>
      <p className="font-mono text-sm text-zinc-500">length {params.token.length}</p>
    </main>
  );
}
