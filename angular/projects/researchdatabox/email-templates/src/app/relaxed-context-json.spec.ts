import { parseEmailContextJson } from './relaxed-context-json';

describe('ET-14 relaxed Context JSON parser', () => {
  it('accepts single quotes, unquoted keys and trailing commas, and emits strict JSON', () => {
    expect(JSON.stringify(parseEmailContextJson("{ aKey: 'aValue', nested: [true, 1,], }"))).toBe(
      '{"aKey":"aValue","nested":[true,1]}'
    );
  });
  it('strips nested prototype keys and rejects executable or malformed values', () => {
    expect(
      JSON.stringify(parseEmailContextJson('{__proto__: 1, nested: {constructor: 2, prototype: 3, safe: 4}}'))
    ).toBe('{"nested":{"safe":4}}');
    for (const source of ['{a: undefined}', '{a: alert(1)}', '{a: 1,,}', '{a: "bad}', '[]'])
      expect(() => parseEmailContextJson(source)).toThrow();
  });
  it('enforces UTF-8 and nesting limits', () => {
    expect(() => parseEmailContextJson('{a:"éé"}', 8)).toThrow();
    expect(() => parseEmailContextJson('{a:'.repeat(66) + '1' + '}'.repeat(66))).toThrow();
  });
});
