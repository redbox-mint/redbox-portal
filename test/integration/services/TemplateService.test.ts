const jsonataHelpers = require("../../../packages/sails-ng-common/dist/src/jsonata-helpers");

const fs = require('node:fs/promises');
const os = require('node:os');
const nodePath = require('node:path');
const ejs = require('ejs');
const Handlebars = require('handlebars');

/*
 * The tests are using `require()` instead of `await import()` because this package is a commonjs type, not module.
 * These are mostly the same in terms of testing the functionality.
 */


/**
 * Simulate a browser loading a js file using eval.
 */
const simulateBrowserLoadingJsFile = async function (value, callback) {
    console.log('simulateBrowserLoadingJsFile value:', value);
    let tempDir = null;
    try {
        tempDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'testing-'));
        const path = `${tempDir}/compile-mapping.js`;
        await fs.writeFile(path, value);
        await callback(path);
    } catch (err) {
        console.error(err);
        throw err;
    } finally {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    }
}

describe('The TemplateService', function () {
    describe('Handlebars template', function () {
        const cases = [
            {
                args: { template: "Handlebars <b>{{doesWhat}}</b> precompiled!", context: { doesWhat: "testing" } },
                expected: "Handlebars <b>testing</b> precompiled!",
            }
        ];
        cases.forEach(({ args, expected }) => {
            it(`should have expected result using args "${JSON.stringify(args)}" expected "${JSON.stringify(expected)}"`, async function () {
                // server
                const serverReady = TemplateService.buildServerHandlebars(args.template);
                const serverResult = serverReady ? serverReady(args.context) : "";
                expect(serverResult).to.eql(expected);

                // client
                let clientString = TemplateService.buildClientHandlebars(args.template);
                clientString = `const Handlebars = require(${JSON.stringify(require.resolve('handlebars'))}); exports.testingData = Handlebars.template(${clientString});`
                await simulateBrowserLoadingJsFile(clientString, async (path) => {
                    const clientReady = require(path);
                    const clientResult = clientReady.testingData(args.context);
                    expect(clientResult).to.eql(expected);
                });
            });
        });
    });
    describe('compile mapping', function () {
        const extraHandlebars = {libraries: { Handlebars: Handlebars}};
        const extraJsonata = {libraries: {jsonata: jsonataHelpers.jsonataDecodeCompile}};
        const extraHandlebarsAndJsonata = {libraries: { Handlebars: Handlebars, jsonata: jsonataHelpers.jsonataDecodeCompile}};
        const cases = [
            {
                args: { inputs: [], contexts: [] },
                expected: [],
            },
            {
                args: {
                    inputs: [
                        { key: ['test1'], kind: "handlebars", value: "Handlebars <b>{{doesWhat}}</b> precompiled!" },
                        { key: ['test2'], kind: "jsonata", value: "$sum(example.value)" },
                        { key: ['test3'], kind: "jsonata", value: "$exists($jsonata)" },
                        { key: ['test4'], kind: "jsonata", value: "$eval(\"1+1\")" },
                    ],
                    contexts: [
                        { key: ["test1"], context: { doesWhat: "testing" }, extra: extraHandlebars },
                        { key: ["test1"], context: { doesWhat: "another one" }, extra: extraHandlebars },
                        { key: ["test2"], context: { example: [{ value: 4 }, { value: 7 }, { value: 13 }] }, extra: extraJsonata},
                        { key: ["test2"], context: { example: [{ value: 52 }, { value: 185 }] }, extra: extraJsonata },
                        { key: ["test3"], context: {}, extra: extraJsonata },
                        { key: ["test4"], context: {}, extra: extraJsonata },
                    ]
                },
                expected: [
                    "Handlebars <b>testing</b> precompiled!",
                    "Handlebars <b>another one</b> precompiled!",
                    24,
                    237,
                    false,
                    new Error('Attempted to invoke eval'),
                ],
            },
            {
                args: {
                    inputs: [
                        { key: ['test1'], kind: "jsonata", value: "$sum(example.value)" },
                        { key: ['test2'], kind: "jsonata", value: "$exists($jsonata)" },
                        { key: ['test3'], kind: "jsonata", value: "$eval(\"1+a\", {\"a\":2})" },
                        { key: ['test4'], kind: "jsonata", value: "$jsonata(\"1+a\", {\"a\": 2})" },
                    ],
                    contexts: [
                        { key: ["test1"], context: { example: [{ value: 4 }, { value: 7 }, { value: 13 }] }, extra: extraJsonata },
                        { key: ["test2"], context: {}, extra: extraJsonata },
                        { key: ["test3"], context: {}, extra: extraJsonata },
                        { key: ["test4"], context: {}, extra: extraJsonata },
                    ]
                },
                expected: [
                    24,
                    false,
                    new Error('Attempted to invoke eval'),
                    new Error('Attempted to invoke a non-function'),
                ],
            },
        ];
        cases.forEach(({ args, expected }) => {
          it(`should have expected result with ${JSON.stringify(args.contexts.map((c, index) => {
            return {
              key: c.key,
              context: c.context,
              ...args.inputs.find(i =>
                  i.key.length === c.key.length && i.key.every((k, keyIndex) =>
                    k === c.key[keyIndex]
                  )
              ),
              expected: expected[index],
            }
          }))}`, async function () {
                // client
                const clientMapping = TemplateService.buildClientMapping(args.inputs);

                // Verify structure matches new implementation (key is [string], value has (context))
                // For handlebars:
                const handlebarsInput = args.inputs.find(i => i.kind === 'handlebars');
                if (handlebarsInput) {
                    const handlebarsItem = clientMapping.find(i => i.key[0] === handlebarsInput.key[0]);
                    expect(handlebarsItem.key).to.be.an('array');
                    expect(handlebarsItem.value).to.contain('(context)');
                }

                // render the view template
                const templateContent = await fs.readFile('./views/dynamicScriptAsset.ejs', { encoding: 'utf8' });
                const clientString = ejs.render(templateContent, { entries: clientMapping });
                await simulateBrowserLoadingJsFile(clientString, async (path) => {
                    const clientReady = require(path);
                    for (let i = 0; i < args.contexts.length; i++) {
                        const context = args.contexts[i];
                        const expectedValue = expected[i];
                        const extra = context.extra ?? {};
                        try {
                          const result = await clientReady.evaluate(context.key, context.context, extra);
                          expect(result).to.eql(expectedValue);
                        } catch (err) {
                          if (err instanceof Error && expectedValue instanceof Error) {
                            expect(err.message).to.eql(expectedValue.message);
                          } else {
                            expect.fail(`Threw unexpected error '${err}' expected '${expectedValue}': ${JSON.stringify({
                              'typeof': typeof err, 'error': err, 'errorString': err?.toString(),
                            })}`);
                          }
                        }
                    }
                });

            });
        });

        it('should encode JSONata expressions as inert data in generated client mappings', async function () {
            const expression = '"\\"); globalThis.__jsonataInjected = true; (\\""';
            const clientMapping = TemplateService.buildClientMapping([
                { key: ['unsafe-jsonata'], kind: 'jsonata', value: expression },
            ]);

            expect(clientMapping).to.have.length(1);
            expect(clientMapping[0].value).to.not.contain(expression);

            const templateContent = await fs.readFile('./views/dynamicScriptAsset.ejs', { encoding: 'utf8' });
            const clientString = ejs.render(templateContent, { entries: clientMapping });

            await simulateBrowserLoadingJsFile(clientString, async (path) => {
                delete globalThis.__jsonataInjected;
                const clientReady = require(path);
                const result = await clientReady.evaluate(['unsafe-jsonata'], {}, extraHandlebarsAndJsonata);

                expect(result).to.eql('"); globalThis.__jsonataInjected = true; ("');
                expect(globalThis.__jsonataInjected).to.be.undefined;
            });
        });
    });
});
