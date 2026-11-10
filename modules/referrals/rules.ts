export type AttachDecision = 'ok' | 'self' | 'not_new' | 'already' | 'existing_order' | 'other_store';

export function attachDecision(input: {
  readonly referrerId: string;
  readonly referredId: string;
  readonly referredIsNew: boolean;
  readonly alreadyReferred: boolean;
  readonly hasVerifiedOrder: boolean;
  readonly sameStore: boolean;
}): AttachDecision {
  if (!input.sameStore || input.referrerId === input.referredId) {
    return input.referrerId === input.referredId ? 'self' : 'other_store';
  }
  if (!input.referredIsNew) {
    return 'not_new';
  }
  if (input.alreadyReferred) {
    return 'already';
  }
  if (input.hasVerifiedOrder) {
    return 'existing_order';
  }
  return 'ok';
}

export function orderQualifies(quotedRetailMinor: bigint, minimumMinor: bigint): boolean {
  if (quotedRetailMinor <= 0n) {
    return false;
  }
  if (minimumMinor <= 0n) {
    return true;
  }
  return quotedRetailMinor >= minimumMinor;
}

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
