import { redirect } from 'next/navigation';

export default function HealthRedirect(): never {
  redirect('/system-health');
}
