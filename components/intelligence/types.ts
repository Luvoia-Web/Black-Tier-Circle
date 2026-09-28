/**
 * @file components/intelligence/types.ts
 *
 * Shared shapes for MemoryOS panels.
 *
 * @module Components
 */

export type IntelligenceMemory = {
  readonly id: string;
  readonly text: string;
  readonly type: string;
  readonly context: string;
  readonly occurredAt: string | null;
  readonly tags: readonly string[];
};

export function hasMemoryKind(memory: IntelligenceMemory, kind: string): boolean {
  return (
    memory.tags.includes(`kind:${kind}`) ||
    memory.tags.includes(kind) ||
    memory.type === `kind:${kind}` ||
    memory.type === kind
  );
}
