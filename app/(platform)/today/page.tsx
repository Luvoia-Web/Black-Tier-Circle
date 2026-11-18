import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/navigation';

export default function TodayPage(): never {
  redirect(ROUTES.platform.overview);
}
