/** Bigints cross the wire as {"$bigint": "<decimal>"} so amounts never pass through floats. */
export function encodeBigints(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? { $bigint: v.toString() } : v));
}

export function reviveBigints<T>(value: unknown): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.$bigint === "string" && Object.keys(o).length === 1) return BigInt(o.$bigint);
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
