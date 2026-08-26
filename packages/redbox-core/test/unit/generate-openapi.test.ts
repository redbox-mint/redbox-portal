import path from 'path';

import sinon from 'sinon';

import { generateOpenApiArtifacts } from '../../scripts/generate-openapi';

let expect: Chai.ExpectStatic;

before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
});

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

    it('emits deterministic, form-independent record-schema reference artifacts', async function () {
      this.timeout(30_000);

      const globalWithSails = globalThis as typeof globalThis & {
        sails?: { config?: Record<string, unknown> };
      };
      const previousSails = globalWithSails.sails;
      const previousConfig = previousSails?.config;
      const hadFormConfig = previousConfig != null && Object.prototype.hasOwnProperty.call(previousConfig, 'form');
      const previousFormConfig = previousConfig?.form;
      const deployedFormName = 'task-8-7-deployed-form-must-not-appear';
      const volatileFormValue = `task-8-7-volatile-${Date.now()}-${process.pid}`;
      const privatePropertyName = 'task-8-7-private-property-must-not-appear';

      globalWithSails.sails = {
        ...(previousSails ?? {}),
        config: {
          ...(previousConfig ?? {}),
          form: {
            defaultForm: deployedFormName,
            forms: {
              [deployedFormName]: {
                name: volatileFormValue,
                components: [{ type: 'text', property: privatePropertyName }],
              },
            },
          },
        },
      };

      const generate = async (outDir: string): Promise<Map<string, string>> => {
        const files = new Map<string, string>();
        await generateOpenApiArtifacts(
          { outDir },
          {
            fsImpl: {
              ensureDir: async () => undefined,
              writeFile: async (filePath, data) => {
                files.set(path.basename(filePath), data);
              },
            },
            swaggerParser: {
              validate: async document => document,
            },
          }
        );
        return files;
      };

      try {
        const firstRun = await generate('/tmp/redbox-openapi-task-8-7-first');
        const secondRun = await generate('/tmp/redbox-openapi-task-8-7-second');

        expect([...firstRun.keys()]).to.deep.equal(['openapi.json', 'openapi.yaml', 'apidocs.apib', 'index.html']);
        expect([...secondRun.entries()]).to.deep.equal([...firstRun.entries()]);

        const openApiJson = firstRun.get('openapi.json');
        expect(openApiJson).to.be.a('string');
        expect(openApiJson).not.to.include(deployedFormName);
        expect(openApiJson).not.to.include(volatileFormValue);
        expect(openApiJson).not.to.include(privatePropertyName);

        const document = JSON.parse(openApiJson!) as {
          paths: Record<string, Record<string, Record<string, any>>>;
        };
        const schemaRoutes = [
          {
            path: '/{branding}/{portal}/api/records/schemas/create/{recordType}',
            operationId: 'resolveCreateRecordSchema',
            hasOperationParameter: true,
            hasCanonicalLink: true,
          },
          {
            path: '/{branding}/{portal}/api/records/schemas/update/{oid}',
            operationId: 'resolveUpdateRecordSchema',
            hasOperationParameter: true,
            hasCanonicalLink: true,
          },
          {
            path: '/{branding}/{portal}/api/records/schemas/{digest}',
            operationId: 'getImmutableRecordSchema',
            hasOperationParameter: false,
            hasCanonicalLink: false,
          },
        ] as const;

        expect(
          Object.keys(document.paths).filter(routePath => routePath.includes('/api/records/schemas/'))
        ).to.have.members(schemaRoutes.map(route => route.path));

        for (const expectedRoute of schemaRoutes) {
          const operation = document.paths[expectedRoute.path]?.get;
          expect(operation?.operationId).to.equal(expectedRoute.operationId);
          expect(operation?.security).to.deep.equal([{ bearerAuth: [] }]);
          expect(operation?.parameters?.find((parameter: any) => parameter.name === 'If-None-Match')).to.deep.include({
            in: 'header',
            required: false,
          });
          expect(Boolean(operation?.parameters?.find((parameter: any) => parameter.name === 'operation'))).to.equal(
            expectedRoute.hasOperationParameter
          );

          for (const status of ['200', '304']) {
            const expectedHeaders = expectedRoute.hasCanonicalLink
              ? ['ETag', 'Cache-Control', 'Vary', 'Link']
              : ['ETag', 'Cache-Control', 'Vary'];
            expect(operation?.responses?.[status]?.headers).to.have.all.keys(expectedHeaders);
          }
          expect(operation?.responses?.['200']?.content).to.have.all.keys('application/schema+json');
          expect(operation?.responses?.['304']?.content).to.equal(undefined);

          for (const status of ['400', '401', '403', '404', '409', '413', '422', '503']) {
            expect(operation?.responses?.[status]?.content).to.have.all.keys('application/problem+json');
          }
        }

        const createRecordOperation = document.paths['/{branding}/{portal}/api/records/metadata/{recordType}']?.post;
        const updateRecordOperation = document.paths['/{branding}/{portal}/api/records/metadata/{oid}']?.put;
        expect(createRecordOperation?.['x-redbox-record-schema-resolver']).to.deep.equal({
          routeTemplate: '{rootContext}/{branding}/{portal}/api/records/schemas/create/{recordType}',
          schemaKind: 'create',
          operationParameter: { name: 'operation', in: 'query', required: false },
          mediaType: 'application/schema+json',
          etag: {
            format: '"sha256:<64-lowercase-hex>"',
            responseHeader: 'ETag',
            revalidationRequestHeader: 'If-None-Match',
            notModifiedStatus: 304,
            authorizationRequiredForRevalidation: true,
          },
        });
        expect(updateRecordOperation?.['x-redbox-record-schema-resolver']).to.deep.equal({
          routeTemplate: '{rootContext}/{branding}/{portal}/api/records/schemas/update/{oid}',
          schemaKind: 'update',
          operationParameter: { name: 'operation', in: 'query', required: false },
          mediaType: 'application/schema+json',
          etag: {
            format: '"sha256:<64-lowercase-hex>"',
            responseHeader: 'ETag',
            revalidationRequestHeader: 'If-None-Match',
            notModifiedStatus: 304,
            authorizationRequiredForRevalidation: true,
            recordWritePreconditionRequestHeader: 'X-ReDBox-Record-Schema-If-Match',
            recordWritePreconditionRequired: false,
            preconditionFailedStatus: 412,
            comparison: 'current-resolved-full-document',
          },
        });
      } finally {
        if (previousSails === undefined) {
          delete globalWithSails.sails;
        } else {
          globalWithSails.sails = previousSails;
          if (previousConfig != null) {
            if (hadFormConfig) {
              previousConfig.form = previousFormConfig;
            } else {
              delete previousConfig.form;
            }
          }
        }
      }
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
        const createRecordOperation = generatedDocument.paths?.['/default/rdmp/api/records/metadata/{recordType}']?.post;
        const updateRecordOperation = generatedDocument.paths?.['/default/rdmp/api/records/metadata/{oid}']?.put;

        expect(operation?.['x-redbox-roles']).to.deep.equal(['DocsRole']);
        expect(createRecordOperation?.['x-redbox-record-schema-resolver']).to.deep.include({
            routeTemplate: '{rootContext}/{branding}/{portal}/api/records/schemas/create/{recordType}',
            schemaKind: 'create',
            mediaType: 'application/schema+json',
        });
        expect(updateRecordOperation?.['x-redbox-record-schema-resolver']).to.deep.include({
            routeTemplate: '{rootContext}/{branding}/{portal}/api/records/schemas/update/{oid}',
            schemaKind: 'update',
            mediaType: 'application/schema+json',
        });
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
        expect(String(writeFile.getCall(3).args[1])).to.include('https://cdn.redoc.ly/redoc/v2.5.2/bundles/redoc.standalone.js');
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
