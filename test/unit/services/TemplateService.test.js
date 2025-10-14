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
        callback(path);
    } catch (err) {
        console.error(err);
    } finally {
        if (tempDir) {
            await fs.rm(tempDir, {recursive: true, force: true});
        }
    }
}

describe('The TemplateService', function () {
    describe('JSONata expression', function () {
        const cases = [
            {
                args: {
                    expression: "$sum(example.value)",
                    input: {example: [{value: 4}, {value: 7}, {value: 13}]},
                    bindings: undefined
                },
                expected: 24,
            },
            {
                args: {
                    expression: "$a + $b()",
                    input: {},
                    bindings: {a: 4, b: () => 78},
                },
                expected: 82,
            }
        ];
        cases.forEach(({args, expected}) => {
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

    describe('Handlebars template', function () {
        const cases = [
            {
                args: {template: "Handlebars <b>{{doesWhat}}</b> precompiled!", context: {doesWhat: "testing"}},
                expected: "Handlebars <b>testing</b> precompiled!",
            }
        ];
        cases.forEach(({args, expected}) => {
            it(`should have expected result using args "${JSON.stringify(args)}" expected "${JSON.stringify(expected)}"`, async function () {
                // server
                const serverReady = TemplateService.buildServerHandlebars(args.template);
                const serverResult = serverReady ? serverReady(args.context) : "";
                expect(serverResult).to.eql(expected);

                // client
                let clientString = TemplateService.buildClientHandlebars(args.template);
                clientString = `export const testingData = Handlebars.template(${clientString});`
                await simulateBrowserLoadingJsFile(clientString, async (path) => {
                    const clientReady = require(path);
                    const clientResult = clientReady.testingData(args.context);
                    expect(clientResult).to.eql(expected);
                });
            });
        });
    });
    describe('compile mapping', function () {
        const cases = [
            {
                args: {inputs: [], contexts: []},
                expected: [],
            },
            {
                args: {
                    inputs: [
                        {key: ['test1'], kind: "handlebars", value: "Handlebars <b>{{doesWhat}}</b> precompiled!"},
                        {key: ['test2'], kind: "jsonata", value: "$sum(example.value)"}
                    ],
                    contexts: [
                        {key: ["test1"], context: {doesWhat: "testing"}},
                        {key: ["test1"], context: {doesWhat: "another one"}},
                        {key: ["test2"], context: {example: [{value: 4}, {value: 7}, {value: 13}]}, extra: {}},
                        {key: ["test2"], context: {example: [{value: 52}, {value: 185}]}, extra: {}},
                    ]
                },
                expected: [
                    "Handlebars <b>testing</b> precompiled!",
                    "Handlebars <b>another one</b> precompiled!",
                    24,
                    237,
                ],
            },
        ];
        cases.forEach(({args, expected}) => {
            it(`should have expected result using args "${JSON.stringify(args)}" expected "${JSON.stringify(expected)}"`, async function () {
                // client
                const clientMapping = TemplateService.buildClientMapping(args.inputs);
                // render the view template
                const templateContent = await fs.readFile('./views/dynamicScriptAsset.ejs', { encoding: 'utf8' });
                const clientString = ejs.render(templateContent, {entries: clientMapping});
                await simulateBrowserLoadingJsFile(clientString, async (path) => {
                    const clientReady = require(path);
                    for (let i = 0; i < args.contexts; i++) {
                        const context = args.contexts[i];
                        const expected = args.expected[i];
                        const extra = Object.assign({}, {libraries: {Handlebars: Handlebars}}, context.extra ?? {});
                        const result = clientReady.evaluate(context.key, context.context, extra);
                        expect(result).to.eql(expected);
                    }
                });

            });
        });
    });
});