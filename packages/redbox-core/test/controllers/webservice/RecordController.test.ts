let expect: Chai.ExpectStatic;
import("chai").then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of } from 'rxjs';

import { Controllers } from '../../../src/controllers/webservice/RecordController';

type PermissionCase = {
    name: string;
    method:
    | 'addUserEdit'
    | 'addUserView'
    | 'removeUserEdit'
    | 'removeUserView'
    | 'addRoleEdit'
    | 'addRoleView'
    | 'removeRoleEdit'
    | 'removeRoleView';
    body: Record<string, unknown>;
    initialAuthorization: Record<string, string[]>;
    expectedFields: Array<[string, string[]]>;
};

function makeThrowingRequest(
    apiRequest: Sails.Req['apiRequest'],
    extra: Partial<Sails.Req> = {}
): Sails.Req {
    const request = {
        session: { branding: 'default' },
        user: { username: 'tester' },
        apiRequest,
        ...extra,
    } as Record<string, unknown>;

    Object.defineProperty(request, 'body', {
        configurable: true,
        enumerable: true,
        get() {
            throw new Error('raw req.body should not be used');
        },
    });

    return request as Sails.Req;
}

function successResult(oid = 'record-1') {
    return {
        oid,
        isSuccessful: () => true,
    };
}

function cloneAuthorization(authorization: Record<string, string[]>): Record<string, string[]> {
    return Object.keys(authorization).reduce((acc, key) => {
        acc[key] = [...authorization[key]];
        return acc;
    }, {} as Record<string, string[]>);
}

async function flushPromises(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
}

describe('Webservice RecordController body source', () => {
    let controller: Controllers.Record;
    let originalSails: any;
    let originalBrandingService: any;
    let originalRecordTypesService: any;
    let originalWorkflowStepsService: any;
    let recordsService: {
        getMeta: sinon.SinonStub;
        updateMeta: sinon.SinonStub;
        create: sinon.SinonStub;
    };

    before(async () => {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalBrandingService = (global as any).BrandingService;
        originalRecordTypesService = (global as any).RecordTypesService;
        originalWorkflowStepsService = (global as any).WorkflowStepsService;

        (global as any).sails = {
            config: {
                appUrl: 'https://portal.example',
                record: {
                    attachments: {
                        file: {
                            directory: '/tmp',
                        },
                    },
                },
            },
            log: {
                verbose: sinon.stub(),
                debug: sinon.stub(),
                error: sinon.stub(),
                warn: sinon.stub(),
                info: sinon.stub(),
                trace: sinon.stub(),
            },
        };
        (global as any)._ = require('lodash');
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
            getBrandAndPortalPath: sinon.stub().returns('/default/default'),
        };
        (global as any).RecordTypesService = {
            get: sinon.stub().returns(of({ id: 'record-type-1', name: 'dataset' })),
        };
        (global as any).WorkflowStepsService = {
            get: sinon.stub(),
        };

        controller = new Controllers.Record();
        recordsService = {
            getMeta: sinon.stub(),
            updateMeta: sinon.stub(),
            create: sinon.stub(),
        };
        controller.RecordsService = recordsService as never;
        controller.DatastreamService = {
            addDatastreams: sinon.stub(),
        } as never;
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).BrandingService = originalBrandingService;
        (global as any).RecordTypesService = originalRecordTypesService;
        (global as any).WorkflowStepsService = originalWorkflowStepsService;
    });

    describe('permission handlers', () => {
        const userPermissionCases: PermissionCase[] = [
            {
                name: 'addUserEdit',
                method: 'addUserEdit',
                body: { users: ['new-editor'], pendingUsers: ['queued-editor'] },
                initialAuthorization: {
                    edit: ['existing-editor'],
                    editPending: ['existing-editor-pending'],
                    view: ['existing-view'],
                    viewPending: ['existing-view-pending'],
                },
                expectedFields: [
                    ['edit', ['existing-editor', 'new-editor']],
                    ['editPending', ['existing-editor-pending', 'queued-editor']],
                ],
            },
            {
                name: 'addUserView',
                method: 'addUserView',
                body: { users: ['new-viewer'], pendingUsers: ['queued-viewer'] },
                initialAuthorization: {
                    edit: ['existing-editor'],
                    editPending: ['existing-editor-pending'],
                    view: ['existing-view'],
                    viewPending: ['existing-view-pending'],
                },
                expectedFields: [
                    ['view', ['existing-view', 'new-viewer']],
                    ['viewPending', ['existing-view-pending', 'queued-viewer']],
                ],
            },
            {
                name: 'removeUserEdit',
                method: 'removeUserEdit',
                body: { users: ['existing-editor'], pendingUsers: ['existing-editor-pending'] },
                initialAuthorization: {
                    edit: ['existing-editor'],
                    editPending: ['existing-editor-pending'],
                    view: ['existing-view'],
                    viewPending: ['existing-view-pending'],
                },
                expectedFields: [
                    ['edit', []],
                    ['editPending', []],
                ],
            },
            {
                name: 'removeUserView',
                method: 'removeUserView',
                body: { users: ['existing-view'], pendingUsers: ['existing-view-pending'] },
                initialAuthorization: {
                    edit: ['existing-editor'],
                    editPending: ['existing-editor-pending'],
                    view: ['existing-view'],
                    viewPending: ['existing-view-pending'],
                },
                expectedFields: [
                    ['view', []],
                    ['viewPending', []],
                ],
            },
        ];

        for (const testCase of userPermissionCases) {
            it(`uses req.apiRequest body in ${testCase.name}`, async () => {
                const permissionRecord = {
                    authorization: cloneAuthorization(testCase.initialAuthorization),
                };
                recordsService.getMeta.resolves(permissionRecord);
                recordsService.updateMeta.resolves(successResult());
                const req = makeThrowingRequest({
                    params: { oid: 'record-1' },
                    query: {},
                    body: testCase.body,
                    files: {},
                });
                const sendRespStub = sinon.stub(controller as any, 'sendResp');

                await (controller as any)[testCase.method](req, {} as Sails.Res);

                expect(recordsService.updateMeta.calledOnce).to.be.true;
                expect(recordsService.getMeta.callCount).to.equal(2);

                const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
                for (const [field, expectedValues] of testCase.expectedFields) {
                    expect(updatedRecord.authorization[field]).to.deep.equal(expectedValues);
                }
                expect(sendRespStub.calledOnce).to.be.true;
                expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal(permissionRecord.authorization);
            });
        }

        const rolePermissionCases: PermissionCase[] = [
            {
                name: 'addRoleEdit',
                method: 'addRoleEdit',
                body: { roles: ['new-edit-role'] },
                initialAuthorization: {
                    editRoles: ['existing-edit-role'],
                    viewRoles: ['existing-view-role'],
                },
                expectedFields: [['editRoles', ['existing-edit-role', 'new-edit-role']]],
            },
            {
                name: 'addRoleView',
                method: 'addRoleView',
                body: { roles: ['new-view-role'] },
                initialAuthorization: {
                    editRoles: ['existing-edit-role'],
                    viewRoles: ['existing-view-role'],
                },
                expectedFields: [['viewRoles', ['existing-view-role', 'new-view-role']]],
            },
            {
                name: 'removeRoleEdit',
                method: 'removeRoleEdit',
                body: { roles: ['existing-edit-role'] },
                initialAuthorization: {
                    editRoles: ['existing-edit-role'],
                    viewRoles: ['existing-view-role'],
                },
                expectedFields: [['editRoles', []]],
            },
            {
                name: 'removeRoleView',
                method: 'removeRoleView',
                body: { roles: ['existing-view-role'] },
                initialAuthorization: {
                    editRoles: ['existing-edit-role'],
                    viewRoles: ['existing-view-role'],
                },
                expectedFields: [['viewRoles', []]],
            },
        ];

        for (const testCase of rolePermissionCases) {
            it(`uses req.apiRequest body in ${testCase.name}`, async () => {
                const permissionRecord = {
                    authorization: cloneAuthorization(testCase.initialAuthorization),
                };
                recordsService.getMeta.resolves(permissionRecord);
                recordsService.updateMeta.resolves(successResult());
                const req = makeThrowingRequest({
                    params: { oid: 'record-1' },
                    query: {},
                    body: testCase.body,
                    files: {},
                });
                const sendRespStub = sinon.stub(controller as any, 'sendResp');

                await (controller as any)[testCase.method](req, {} as Sails.Res);

                expect(recordsService.updateMeta.calledOnce).to.be.true;
                expect(recordsService.getMeta.callCount).to.equal(2);

                const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
                for (const [field, expectedValues] of testCase.expectedFields) {
                    expect(updatedRecord.authorization[field]).to.deep.equal(expectedValues);
                }
                expect(sendRespStub.calledOnce).to.be.true;
                expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal(permissionRecord.authorization);
            });
        }
    });

    describe('metadata handlers', () => {
        it('uses req.apiRequest body in updateMeta', async () => {
            const body = {
                title: 'Validated title',
                tags: ['incoming'],
                nested: { value: 2 },
            };
            const record = {
                metadata: {
                    title: 'Existing title',
                    tags: ['existing'],
                    nested: { value: 1 },
                },
                metaMetadata: { attachmentFields: [] },
            };
            recordsService.getMeta.resolves(record);
            recordsService.updateMeta.resolves(successResult());
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: { merge: true, datastreams: false },
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.updateMeta(req, {} as Sails.Res);

            expect(recordsService.updateMeta.calledOnce).to.be.true;
            const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
            expect(updatedRecord.metadata.tags).to.deep.equal(['existing', 'incoming']);
            expect(updatedRecord.metadata.nested.value).to.equal(2);
            expect(sendRespStub.calledOnce).to.be.true;
        });

        it('uses req.apiRequest body in updateObjectMeta', async () => {
            const body = {
                kind: 'object-meta',
                source: 'validated',
            };
            const record = {
                metaMetadata: { kind: 'original' },
            };
            recordsService.getMeta.resolves(record);
            recordsService.updateMeta.resolves(successResult());
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.updateObjectMeta(req, {} as Sails.Res);

            expect(recordsService.updateMeta.calledOnce).to.be.true;
            const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
            expect(updatedRecord.metaMetadata).to.deep.equal(body);
            expect(sendRespStub.calledOnce).to.be.true;
        });

        it('uses req.apiRequest body in create', async () => {
            const body = {
                authorization: {
                    edit: ['creator'],
                    view: ['reader'],
                    editPending: [],
                    viewPending: [],
                },
                metadata: {
                    title: 'Validated record',
                },
            };
            recordsService.create.resolves(successResult('created-record'));
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.create(req, {} as Sails.Res);
            await flushPromises();

            expect(recordsService.create.calledOnce).to.be.true;
            const createRequest = recordsService.create.firstCall.args[1] as any;
            expect(createRequest.metadata).to.deep.equal(body.metadata);
            expect(createRequest.authorization).to.deep.equal(body.authorization);
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(201);
            expect(sendRespStub.firstCall.args[2]?.headers?.Location).to.equal(
                'https://portal.example/default/default/api/records/metadata/created-record'
            );
        });
    });

    describe('harvest handlers', () => {
        it('uses req.apiRequest body in harvest', async () => {
            const body = {
                records: [
                    {
                        harvestId: 'harvest-1',
                        recordRequest: {
                            metadata: {
                                title: 'Validated harvest metadata',
                            },
                        },
                    },
                ],
            };
            const existingRecords = [
                {
                    redboxOid: 'record-1',
                    metadata: { title: 'Existing harvest metadata' },
                },
            ];
            const findExistingHarvestRecordStub = sinon
                .stub(controller as any, 'findExistingHarvestRecord')
                .resolves(existingRecords);
            const updateHarvestRecordStub = sinon
                .stub(controller as any, 'updateHarvestRecord')
                .resolves({ harvestId: 'harvest-1', oid: 'record-1', status: true });
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.harvest(req, {} as Sails.Res);

            expect(findExistingHarvestRecordStub.calledOnce).to.be.true;
            expect(updateHarvestRecordStub.calledOnce).to.be.true;
            expect(updateHarvestRecordStub.firstCall.args[3]).to.deep.equal(body.records[0].recordRequest.metadata);
            expect(sendRespStub.calledOnce).to.be.true;
        });

        it('uses req.apiRequest body in legacyHarvest', async () => {
            const body = {
                records: [
                    {
                        harvest_id: 'legacy-harvest-1',
                        metadata: {
                            data: {
                                title: 'Validated legacy metadata',
                            },
                        },
                    },
                ],
            };
            const existingRecords = [
                {
                    redboxOid: 'record-2',
                    metadata: { title: 'Existing legacy metadata' },
                },
            ];
            const findExistingHarvestRecordStub = sinon
                .stub(controller as any, 'findExistingHarvestRecord')
                .resolves(existingRecords);
            const updateHarvestRecordStub = sinon
                .stub(controller as any, 'updateHarvestRecord')
                .resolves({ harvestId: 'legacy-harvest-1', oid: 'record-2', status: true });
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.legacyHarvest(req, {} as Sails.Res);

            expect(findExistingHarvestRecordStub.calledOnce).to.be.true;
            expect(updateHarvestRecordStub.calledOnce).to.be.true;
            expect(updateHarvestRecordStub.firstCall.args[3]).to.deep.equal(body.records[0].metadata.data);
            expect(sendRespStub.calledOnce).to.be.true;
        });
    });
});
