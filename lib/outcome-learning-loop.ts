/**
 * @file lib/outcome-learning-loop.ts
 *
 * Promotes a repeated customer outcome into the store bank.
 * Three or more customers with a similar context and the same outcome
 * become one store-level learned pattern. Failures never surface.
 *
 * @module Intelligence
 */

import {
  recallTenantExperience,
  resolveTenantMemoryBank,
  retainCommerceExperience,
  type MemoryEvidence,
} from './hindsight';

const STOP_WORDS = new Set([
  'with',
  'this',
  'that',
  'from',
  'have',
  'customer',
  'customers',
  'recommendation',
  'converted',
  'rejected',
  'outcome',
  'the',
  'and',
  'for',
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3 && !STOP_WORDS.has(token)),
  );
}

function similarContext(memoryText: string, context: string): boolean {
  const needle = context.trim().toLowerCase();
  if (needle.length === 0) {
    return false;
  }
  if (memoryText.toLowerCase().includes(needle)) {
    return true;
  }
  const left = tokens(context);
  const right = tokens(memoryText);
  if (left.size === 0 || right.size === 0) {
    return false;
  }
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap / left.size >= 0.5;
}

function isLearnedPattern(memory: MemoryEvidence): boolean {
  return (
    memory.tags.includes('kind:learned_pattern') ||
    memory.tags.includes('source:learning_loop') ||
    memory.text.toLowerCase().includes('recurring store pattern')
  );
}

function matchesOutcome(memory: MemoryEvidence, outcome: 'converted' | 'rejected'): boolean {
  if (isLearnedPattern(memory)) {
    return false;
  }
  const blob = `${memory.text}\n${memory.context}\n${memory.tags.join(' ')}`.toLowerCase();
  return (
    blob.includes(`outcome:${outcome}`) ||
    blob.includes(`"outcome":"${outcome}"`) ||
    blob.includes(`outcome ${outcome}`)
  );
}

function customerKey(memory: MemoryEvidence): string | null {
  const tagged = memory.tags.find((tag) => tag.startsWith('customer:') && tag.length > 'customer:'.length);
  if (tagged) {
    return tagged.slice('customer:'.length);
  }
  const match = /customer:([A-Za-z0-9_-]+)/.exec(`${memory.text}\n${memory.context}`);
  return match?.[1] ?? null;
}

function patternSummary(context: string): string {
  const summary = context.trim().replace(/\s+/g, ' ');
  if (summary.length === 0) {
    return 'this recommendation pattern';
  }
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

/**
 * Recalls store outcomes and, at three distinct customers, retains a learned pattern.
 * Never throws. Memory failure is logged and ignored.
 */
export async function runOutcomeLearningLoop(
  tenantId: string,
  customerId: string,
  outcome: 'converted' | 'rejected',
  context: string,
): Promise<void> {
  try {
    if (tenantId.trim().length === 0 || customerId.trim().length === 0) {
      return;
    }
    const bankId = resolveTenantMemoryBank(tenantId);
    const memories = await recallTenantExperience(bankId, 'outcome patterns converted rejected');
    const customers = new Set<string>([customerId]);
    for (const memory of memories) {
      if (!matchesOutcome(memory, outcome)) {
        continue;
      }
      const blob = `${memory.text}\n${memory.context}`;
      if (!similarContext(blob, context)) {
        continue;
      }
      const key = customerKey(memory);
      if (key) {
        customers.add(key);
      }
    }
    if (customers.size < 3) {
      return;
    }
    const alreadyPromoted = memories.some((memory) => {
      if (!isLearnedPattern(memory)) {
        return false;
      }
      const blob = `${memory.text}\n${memory.context}\n${memory.tags.join(' ')}`;
      return blob.toLowerCase().includes(outcome) && similarContext(blob, context);
    });
    if (alreadyPromoted) {
      return;
    }
    const summary = patternSummary(context);
    const documentId = `learned-pattern-${outcome}-${tenantId}-${Date.now()}`;
    await retainCommerceExperience(
      bankId,
      documentId,
      `Recurring store pattern: customers with ${summary} consistently result in outcome: ${outcome}. Auto-promoted from customer learning loop.`,
      ['kind:learned_pattern', `outcome:${outcome}`, 'source:learning_loop', 'fact:experience'],
      `learned pattern ${outcome}`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown error';
    console.error('outcome learning loop failed', message);
  }
}
