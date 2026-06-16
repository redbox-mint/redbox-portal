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
      expect.fail(`Threw unexpected error ${JSON.stringify({error, type: typeof error})}`);
    }
  }

  const cases = [
    {
      args: {
        expression: '$sum(example.value)',
        input: {example: [{value: 4}, {value: 7}, {value: 13}]},
        bindings: undefined,
      },
      expected: 24,
    },
    {
      args: {
        expression: '$a + $b()',
        input: {},
        bindings: {a: 4, b: () => 78},
      },
      expected: 82,
    },
    {
      args: {
        expression: '$.name',
        input: {name: 'testing'},
        bindings: undefined,
      },
      expected: 'testing',
    },
    {
      args: {
        expression: '{{{{invalid',
        input: {name: 'testing'},
        bindings: undefined,
      },
      expected: new Error('Expected ":" before end of expression'),
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: null},
        bindings: undefined,
      },
      expected: '',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: undefined},
        bindings: undefined,
      },
      expected: '',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, format)',
        input: {date: undefined, format: undefined},
        bindings: undefined,
      },
      expected: '',
    },
    {
      // unparsable date
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: 'abc'},
        bindings: undefined,
      },
      expected: '',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy-MM")',
        input: {date: 1781092138000},
        bindings: undefined,
      },
      expected: '2026-06',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy/MM")',
        // We want to use local timezones in the browser.
        // Use Z timezone to try to avoid rolling over to next or previous day.
        input: {date: new Date('2025-08-10T10:00:00Z')},
        bindings: undefined,
      },
      expected: '2025/08',
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
        expression: '$luxonFormatDate(date, "yyyy/MM/dd", "MM/dd/yyyy")',
        input: {date: '06/10/2026'},
        bindings: undefined,
      },
      expected: '2026/06/10',
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
        // We want to use local timezones in the browser.
        // Use a timezone near midday UTC to try to avoid rolling over to next or previous day.
        // should format RFC 2822 date string values with luxon JSONata helper
        input: {date: 'Wed, 10 Jun 2026 11:00:00 +0030'},
        bindings: undefined,
      },
      expected: '2026',
    },
    {
      args: {
        expression: '$luxonFormatDate(date, "yyyy")',
        input: {date: ['Wed, 10 Jun 2026 11:00:00 +0030']},
        bindings: undefined,
      },
      expected: new Error("Argument 1 of function \"luxonFormatDate\" does not match function signature"),
    },
    {
      args: {
        // not expose the jsonata factory to client-style JSONata library bindings
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
        // should not allow JSONata eval to run dynamic expressions on the server side
        expression: '$eval("1+a", {"a": 2})',
        input: null,
        bindings: undefined,
      },
      expected: new Error('Attempted to invoke eval'),
    },
  ];
  cases.forEach(({args, expected}) => {
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
