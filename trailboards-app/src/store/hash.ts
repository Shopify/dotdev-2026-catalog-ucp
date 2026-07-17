// Idempotency key (LLD §8.2): equal salient context → equal hash → skip resolve.
// Browser-synchronous FNV-1a over a stable JSON encoding (key order fixed), so we
// avoid SubtleCrypto's async API on a hot path. Not cryptographic — just a stable digest.

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function fnv1a(input: unknown): string {
  const str = typeof input === 'string' ? input : stableStringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
