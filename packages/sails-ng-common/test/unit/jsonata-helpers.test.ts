import {
  jsonataCompile,
  jsonataCompileAndEvaluate,
  jsonataEvaluate,
  jsonataEvaluateFunc,
} from '../../src';

describe('JSONata helpers', function () {
  let expect: Chai.ExpectStatic;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  function compareError(error: unknown, expected: unknown) {
    if ('message' in (error as Record<string, unknown>) && expected instanceof Error) {
      expect((error as Record<string, unknown>).message).to.eql(expected.message);
    } else {
      expect.fail(`Threw unexpected error ${JSON.stringify({ error, type: typeof error })}`);
    }
  }

  const cases = [
    {
      args: {
        expression: '$sum(example.value)',
        input: { example: [{ value: 4 }, { value: 7 }, { value: 13 }] },
        bindings: undefined,
      },
      expected: 24,
    },
    {
      args: {
        expression: '$a + $b()',
        input: {},
        bindings: { a: 4, b: () => 78 },
      },
      expected: 82,
    },
    {
      args: {
        expression: '$.name',
        input: { name: 'testing' },
        bindings: undefined,
      },
      expected: 'testing',
    },
    {
      args: {
        expression: '{{{{invalid',
        input: { name: 'testing' },
        bindings: undefined,
      },
      expected: new Error('Expected ":" before end of expression'),
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: '2026/06/10'},
        bindings: undefined,
      },
      expected: '2026',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: '2026-06-10'},
        bindings: undefined,
      },
      expected: '2026',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: 'Wed, 10 Jun 2026 00:00:00 +0930'},
        bindings: undefined,
      },
      expected: '2026',
    },
    {
      args: {
        expression: '$exists($jsonata)',
        input: null,
        bindings: undefined,
      },
      expected: false,
    },
    {
      args: {
        expression: '$jsonata("1+a", {"a": 2})',
        input: null,
        bindings: undefined,
      },
      expected: new Error('Attempted to invoke a non-function'),
    },
    {
      args: {
        expression: '$eval("1+a", {"a": 2})',
        input: null,
        bindings: undefined,
      },
      expected: undefined,
    },
  ];
  cases.forEach(({ args, expected }) => {
    it(`should have expected result using args "${JSON.stringify(args)}" expected "${JSON.stringify(expected)}"`, async function () {
      try {
        const compiled = jsonataCompile(args.expression);
        expect(compiled).not.to.be.null;
        expect(compiled).to.have.property('evaluate');

        const evaluate = await jsonataEvaluate(compiled, args.input, args.bindings);
        expect(evaluate).to.eql(expected);
      } catch (error) {
        compareError(error, expected);
      }

      try {
        const compileAndEvaluate = await jsonataCompileAndEvaluate(args.expression, args.input, args.bindings);
        expect(compileAndEvaluate).to.eql(expected);
      } catch (error) {
        compareError(error, expected);
      }

      try {
        const evaluateFunc = jsonataEvaluateFunc(args.expression, args.bindings);
        const evaluateFuncResult = await evaluateFunc(args.input);
        expect(evaluateFuncResult).to.eql(expected);
      } catch (error) {
        compareError(error, expected);
      }
    });
  });
});
