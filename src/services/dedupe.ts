/**
 * Deduplicate an array of items by a derived key.
 * Items with empty keys or duplicate keys (case-insensitive, trimmed) are removed.
 */
export function dedupe<T>(
  items: T[],
  getKey: (item: T) => string = (x) => String(x)
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item).toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
