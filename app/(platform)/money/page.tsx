import { redirect } from 'next/navigation';

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function MoneyPage({ searchParams }: { readonly searchParams: SearchParams }): never {
  const section = first(searchParams.section);
  const wallet = first(searchParams.wallet);
  if (section === 'topups') {
    redirect('/payments');
  }
  if (section === 'tokens' || section === 'ledger' || section === 'debts') {
    redirect(`/wallets?section=${encodeURIComponent(section)}`);
  }
  if (wallet) {
    redirect(`/wallets?wallet=${encodeURIComponent(wallet)}`);
  }
  redirect('/wallets');
}
