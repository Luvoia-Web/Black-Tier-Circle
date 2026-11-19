import { redirect } from 'next/navigation';

export default function MoneyPage(): never {
  redirect('/wallets');
}
