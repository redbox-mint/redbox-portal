/** Measure JSON output while aborting traversal before a large serialized result is allocated. */
export function relatedOutputBytes(value: unknown, limit: number): number {
  let bytes = 0;
  let root = true;
  const children = new WeakMap<object, number>();
  const add = (amount: number) => {
    bytes += amount;
    if (bytes > limit) throw new RangeError('Related output limit');
  };
  const text = (value: string) => {
    // A quoted/escaped string cannot be smaller than its UTF-8 contents.
    // Check this first so JSON.stringify never copies an oversized scalar.
    if (Buffer.byteLength(value) + 2 > limit - bytes) throw new RangeError('Related output limit');
    add(Buffer.byteLength(JSON.stringify(value)));
  };
  JSON.stringify(value, function (key, current) {
    if (current instanceof String || current instanceof Number || current instanceof Boolean) current = current.valueOf();
    const omitted = current === undefined || typeof current === 'function' || typeof current === 'symbol';
    if (!root) {
      const array = Array.isArray(this);
      if (omitted && !array) return current;
      const count = children.get(this) ?? 0;
      if (count) add(1);
      children.set(this, count + 1);
      if (!array) { text(key); add(1); }
    }
    root = false;
    if (omitted || current === null) add(4);
    else if (typeof current === 'string') text(current);
    else if (typeof current === 'object') { add(2); children.set(current, 0); }
    else add(Buffer.byteLength(JSON.stringify(current)));
    return current;
  });
  return bytes;
}
