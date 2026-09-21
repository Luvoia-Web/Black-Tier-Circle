/**
 * @file app/(auth)/login/page.tsx
 *
 * Login page stub.
 *
 * Phase 1 wires this to Supabase Auth. Phase 0 only renders the shell
 * so the route exists and type-checks.
 *
 * @module Auth
 */

export default function LoginPage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-zinc-400">Auth is stubbed in Phase 0.</p>
    </main>
  );
}
