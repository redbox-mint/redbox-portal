import jsonata from 'jsonata';
import {
  jsonataCompile,
  jsonataCompileAndEvaluate,
  jsonataEvaluate,
  jsonataEvaluateFunc,
  jsonataLibrary,
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

  it('should expose luxon date formatting to compiled JSONata expressions', async function () {
    const actual = await jsonataCompileAndEvaluate('$luxonFormatDate(date, "yyyy")', {
      date: '2026/06/10',
    });

    expect(actual).to.eql('2026');
  });

  it('should not allow JSONata eval to run dynamic expressions on the server side', async function () {
    const actual = await jsonataCompileAndEvaluate('$eval("1+1")', {});

    expect(actual).to.be.undefined;
  });

  it('should expose luxon date formatting to client-style JSONata library bindings', async function () {
    const actual = await jsonata('$luxonFormatDate(date, "yyyy")').evaluate({ date: '2026-06-10' }, jsonataLibrary);

    expect(actual).to.eql('2026');
  });

  it('should not expose the jsonata factory to client-style JSONata library bindings', async function () {
    expect(jsonataLibrary).not.to.have.property('jsonata');

    const actual = await jsonata('$exists($jsonata)').evaluate({}, jsonataLibrary);

    expect(actual).to.eql(false);
  });

  it('should format RFC 2822 date string values with luxon JSONata helper', async function () {
    const actual = await jsonataCompileAndEvaluate('$luxonFormatDate(date, "yyyy")', {
      date: 'Wed, 10 Jun 2026 00:00:00 +0930',
    });

    expect(actual).to.eql('2026');
  });
});
