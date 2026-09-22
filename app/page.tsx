/**
 * @file app/page.tsx
 *
 * Root path redirects to login once. Middleware treats `/` as public so this
 * cannot loop with /login.
 *
 * @module App
 */

import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/navigation';

export default function HomePage(): never {
  redirect(ROUTES.login);
}
