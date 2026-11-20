import type { BroadcastAudience, BroadcastJobRow } from '@/modules/platform/growth';

export type DiscountCodeRow = {
  readonly id: string;
  readonly code: string;
  readonly kind: 'percent' | 'fixed';
  readonly value: string;
  readonly minOrderMinor: string;
  readonly maxUses: number | null;
  readonly usedCount: number;
  readonly perCustomerLimit: number | null;
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly active: boolean;
};

export type AudienceCounts = {
  readonly all: number;
  readonly buyers: number;
  readonly inactive: number;
  readonly skippedBlocked: number;
};

export type GrowthPayload = {
  readonly role: 'owner' | 'reseller';
  readonly needsMigration: boolean;
  readonly codes: readonly DiscountCodeRow[];
  readonly events: {
    readonly enabled: boolean;
    readonly title: string;
    readonly body: string;
    readonly link: string;
  };
  readonly storeName: string;
  readonly links: {
    readonly channel: string;
    readonly group: string;
    readonly website: string;
  };
  readonly recipients: number;
  readonly audiences: AudienceCounts;
  readonly broadcasts: readonly BroadcastJobRow[];
  readonly broadcastsNeedsMigration: boolean;
  readonly testChatId: string | null;
};

export type { BroadcastAudience, BroadcastJobRow };
