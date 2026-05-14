// TODO
describe('JSONata expression', function () {
  const cases = [
    {
      args: {
        expression: "$sum(example.value)",
        input: { example: [{ value: 4 }, { value: 7 }, { value: 13 }] },
        bindings: undefined
      },
      expected: 24,
    },
    {
      args: {
        expression: "$a + $b()",
        input: {},
        bindings: { a: 4, b: () => 78 },
      },
      expected: 82,
    }
  ];
  cases.forEach(({ args, expected }) => {
    it(`should have expected result using args "${JSON.stringify(args)}" expected "${JSON.stringify(expected)}"`, async function () {
      // server
      const serverReady = TemplateService.buildServerJsonata(args.expression);
      const serverResult = await serverReady.evaluate(args.input, args.bindings);
      expect(serverResult).to.eql(expected);

      // client
      let clientString = TemplateService.buildClientJsonata(args.expression);
      clientString = `export const testingData = ${clientString};`;
      await simulateBrowserLoadingJsFile(clientString, async (path) => {
        const clientReady = require(path);
        const clientResult = clientReady.testingData.evaluate(args.input, args.bindings);
        expect(clientResult).to.eql(expected);
      });
    });
  });
});


describe('buildServerJsonata', function() {
  it('should return a compiled JSONata expression', function() {
    const expression = '$.name';

    const result = TemplateService.buildServerJsonata(expression);

    expect(result).not.to.be.null;
    expect(result).to.have.property('evaluate');
  });

  it('should return null for invalid expression', function() {
    const invalidExpression = '{{{{invalid';

    const result = TemplateService.buildServerJsonata(invalidExpression);

    expect(result).to.be.null;
  });
});
