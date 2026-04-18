import path from 'path';

import sinon from 'sinon';

import { generateOpenApiArtifacts } from '../../scripts/generate-openapi';

let expect: Chai.ExpectStatic;
import('chai').then((mod) => expect = mod.expect);

function buildMinimalOpenApiDocument() {
    return {
        openapi: '3.0.3',
        info: {
            title: 'Test API',
            version: '1.0.0',
        },
        paths: {},
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                },
            },
        },
    };
}

describe('generate-openapi script', function () {
    afterEach(function () {
        sinon.restore();
    });

    it('uses runtime auth rules when generating role metadata', async function () {
        const globalWithSails = globalThis as typeof globalThis & {
            sails?: { config?: Record<string, unknown> };
        };
        const previousSails = globalWithSails.sails;
        globalWithSails.sails = {
            config: {
                auth: {
                    rules: [
                        { path: '/:branding/:portal/api/users', role: 'DocsRole', can_read: true },
                    ],
                },
            },
        };

        const validate = sinon.stub().callsFake(async (document: unknown) => document);
        const ensureDir = sinon.stub().resolves();
        const writeFile = sinon.stub().resolves();

        try {
            await generateOpenApiArtifacts(
                {
                    outDir: '/tmp/redbox-openapi-parity',
                    branding: 'default',
                    portal: 'rdmp',
                },
                {
                    fsImpl: {
                        ensureDir,
                        writeFile,
                    },
                    swaggerParser: {
                        validate,
                    },
                    yamlStringifyImpl: () => 'openapi: 3.0.3\n',
                }
            );
        } finally {
            if (previousSails === undefined) {
                delete globalWithSails.sails;
            } else {
                globalWithSails.sails = previousSails;
            }
        }

        const generatedDocument = JSON.parse(String(writeFile.firstCall.args[1])) as {
            paths?: Record<string, Record<string, { [key: string]: unknown }>>;
        };
        const operation = generatedDocument.paths?.['/default/rdmp/api/users']?.get;

        expect(operation?.['x-redbox-roles']).to.deep.equal(['DocsRole']);
        expect(validate.calledOnce).to.equal(true);
    });

    it('validates the generated OpenAPI document before writing files', async function () {
        const document = buildMinimalOpenApiDocument();
        const validate = sinon.stub().resolves(document);
        const ensureDir = sinon.stub().resolves();
        const writeFile = sinon.stub().resolves();
        const buildMergedApiOpenApiDocumentImpl = sinon.stub().returns(document);
        const buildMergedApiBlueprintImpl = sinon.stub().returns('FORMAT: 1A');

        await generateOpenApiArtifacts(
            {
                outDir: '/tmp/redbox-openapi',
                branding: 'default',
                portal: 'rdmp',
            },
            {
                fsImpl: {
                    ensureDir,
                    writeFile,
                },
                swaggerParser: {
                    validate,
                },
                buildMergedApiOpenApiDocumentImpl,
                buildMergedApiBlueprintImpl,
                yamlStringifyImpl: () => 'openapi: 3.0.3\n',
            }
        );

        expect(buildMergedApiOpenApiDocumentImpl.calledOnceWithExactly({ branding: 'default', portal: 'rdmp' })).to.equal(true);
        expect(validate.calledOnceWithExactly(document)).to.equal(true);
        expect(buildMergedApiBlueprintImpl.calledOnceWithExactly({ branding: 'default', portal: 'rdmp' })).to.equal(true);
        expect(ensureDir.calledOnceWithExactly('/tmp/redbox-openapi')).to.equal(true);
        expect(writeFile.callCount).to.equal(4);
        expect(writeFile.firstCall.args[0]).to.equal(path.join('/tmp/redbox-openapi', 'openapi.json'));
        expect(writeFile.firstCall.args[1]).to.equal(JSON.stringify(document, null, 2));
    });

    it('aborts file writes when OpenAPI validation fails', async function () {
        const document = buildMinimalOpenApiDocument();
        const validationError = new Error('invalid OpenAPI document');
        const validate = sinon.stub().rejects(validationError);
        const ensureDir = sinon.stub().resolves();
        const writeFile = sinon.stub().resolves();
        const buildMergedApiOpenApiDocumentImpl = sinon.stub().returns(document);
        const buildMergedApiBlueprintImpl = sinon.stub().returns('FORMAT: 1A');

        try {
            await generateOpenApiArtifacts(
                {
                    outDir: '/tmp/redbox-openapi',
                    branding: 'default',
                    portal: 'rdmp',
                },
                {
                    fsImpl: {
                        ensureDir,
                        writeFile,
                    },
                    swaggerParser: {
                        validate,
                    },
                    buildMergedApiOpenApiDocumentImpl,
                    buildMergedApiBlueprintImpl,
                    yamlStringifyImpl: () => 'openapi: 3.0.3\n',
                }
            );
            throw new Error('Expected OpenAPI validation to fail');
        } catch (error) {
            expect(error).to.equal(validationError);
        }

        expect(buildMergedApiBlueprintImpl.notCalled).to.equal(true);
        expect(ensureDir.notCalled).to.equal(true);
        expect(writeFile.notCalled).to.equal(true);
    });
});