/** Small data-only parser. No eval, comments, functions, expressions or prototype properties. */
export function parseEmailContextJson(source: string, maxBytes = 262144): Record<string, unknown> {
  if (new TextEncoder().encode(source).length > maxBytes) throw new Error('Context JSON exceeds the size limit.');
  let offset = 0;
  const blocked = new Set(['__proto__', 'constructor', 'prototype']);
  const fail = (): never => {
    throw new Error(`Invalid context JSON at offset ${offset}.`);
  };
  const space = () => {
    while (/\s/.test(source[offset] ?? '') && offset < source.length) offset++;
  };
  const string = (): string => {
    const quote = source[offset++];
    let out = '';
    while (offset < source.length) {
      const char = source[offset++];
      if (char === quote) return out;
      if (char.charCodeAt(0) < 32) fail();
      if (char !== '\\') {
        out += char;
        continue;
      }
      const escape = source[offset++];
      const escapes: Record<string, string> = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
      };
      if (escape === "'" && quote === "'") out += "'";
      else if (escape === 'u') {
        const hex = source.slice(offset, offset + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
        out += String.fromCharCode(parseInt(hex, 16));
        offset += 4;
      } else if (Object.hasOwn(escapes, escape)) out += escapes[escape];
      else fail();
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 64) fail();
    space();
    const char = source[offset];
    if (char === '"' || char === "'") return string();
    if (char === '{' || char === '[') {
      const array = char === '[';
      const end = array ? ']' : '}';
      const out: Record<string, unknown> | unknown[] = array ? [] : Object.create(null);
      offset++;
      space();
      if (source[offset] === end) {
        offset++;
        return out;
      }
      while (offset < source.length) {
        let key = '';
        if (!array) {
          space();
          if (source[offset] === '"' || source[offset] === "'") key = string();
          else {
            const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(offset));
            if (!match) fail();
            key = match![0];
            offset += key.length;
          }
          space();
          if (source[offset++] !== ':') fail();
        }
        const child = value(depth + 1);
        if (array) (out as unknown[]).push(child);
        else if (!blocked.has(key)) (out as Record<string, unknown>)[key] = child;
        space();
        if (source[offset] === end) {
          offset++;
          return out;
        }
        if (source[offset++] !== ',') fail();
        space();
        if (source[offset] === end) {
          offset++;
          return out;
        }
      }
      return fail();
    }
    for (const [literal, parsed] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (source.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(offset));
    if (number) {
      offset += number[0].length;
      const parsed = Number(number[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fail();
  };
  const parsed = value(0);
  space();
  if (offset !== source.length || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail();
  return parsed as Record<string, unknown>;
}
