/** @internal A deterministic expression fixture used by browser/server parity tests. */
export interface JSONataParityFixture {
  name: string;
  expression: string;
  context: unknown;
  expected: unknown;
}

/** @internal */
export const jsonataParityFixtures: JSONataParityFixture[] = [
  {
    name: 'evaluates standard JSONata functions',
    expression: '$sum(items.amount)',
    context: { items: [{ amount: 2 }, { amount: 3 }, { amount: 5 }] },
    expected: 10,
  },
  {
    name: 'formats an ISO date through the shared Luxon function',
    expression: '$luxonFormatDate(date, "yyyy-LL-dd")',
    context: { date: '2026-08-22' },
    expected: '2026-08-22',
  },
  {
    name: 'guesses name parts through the shared helper',
    expression: '$guessNameParts(name)',
    context: { name: 'Ada Lovelace' },
    expected: { full: 'Ada Lovelace', first: 'Ada', last: 'Lovelace' },
  },
];
