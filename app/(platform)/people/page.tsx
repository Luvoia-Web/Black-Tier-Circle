import { redirect } from 'next/navigation';

export default function PeoplePage(): never {
  redirect('/customers');
}
