import assert from 'node:assert/strict';
let expect: Chai.ExpectStatic;
import("chai").then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of } from 'rxjs';

import { Controllers } from '../../../src/controllers/webservice/RecordController';
import { createRecordSaveContext, RecordSaveResponse } from '../../../src/RecordSaveResponse';

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
    const result = new RecordSaveResponse(createRecordSaveContext({ requestId: '00000000-0000-4000-8000-000000000000' }));
    result.oid = oid;
    result.success = true;
    result.outcome = 'saved';
    return result;
}

function notSavedResult() {
    const result = new RecordSaveResponse(createRecordSaveContext({
        requestId: '00000000-0000-4000-8000-000000000099',
    }));
    result.success = false;
    result.outcome = 'not-saved';
    result.message = '@record-save-failed';
    return result;
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
    let originalHarvestRunService: any;
    let recordsService: {
        getMeta: sinon.SinonStub;
        getDeletedRecordMeta: sinon.SinonStub;
        updateMeta: sinon.SinonStub;
        create: sinon.SinonStub;
        getDeletedRecords: sinon.SinonStub;
        restoreRecord: sinon.SinonStub;
        destroyDeletedRecord: sinon.SinonStub;
        hasEditAccess: sinon.SinonStub;
        setWorkflowStepRelatedMetadata: sinon.SinonStub;
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
        originalHarvestRunService = (global as any).HarvestRunService;

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
        (global as any).HarvestRunService = {
            submitCompatibilityRecords: sinon.stub().resolves([{ harvestId: 'harvest-1', oid: 'record-1', status: true }]),
            submitLegacyRecords: sinon.stub().resolves([{ harvestId: 'legacy-harvest-1', oid: 'record-2', status: true }]),
            submitChunk: sinon.stub().resolves({
                run: { id: 'run-1', sourceRunId: 'source-run-1', status: 'running' },
                chunk: { id: 'chunk-1', contentHash: 'hash-1', status: 'processed', recordCount: 1, duplicate: false },
            }),
        };

        controller = new Controllers.Record();
        recordsService = {
            getMeta: sinon.stub(),
            getDeletedRecordMeta: sinon.stub(),
            updateMeta: sinon.stub(),
            create: sinon.stub(),
            getDeletedRecords: sinon.stub(),
            restoreRecord: sinon.stub(),
            destroyDeletedRecord: sinon.stub(),
            hasEditAccess: sinon.stub().returns(true),
            setWorkflowStepRelatedMetadata: sinon.stub(),
        };
        controller.RecordsService = recordsService as never;
        controller.DatastreamService = {
            addDatastreams: sinon.stub(),
        } as never;
    });

    it('restores and permanently destroys deleted records in the active brand', async () => {
        const deletedRecordResponse = {
            isSuccessful: () => true,
            items: [{ redboxOid: 'record-1' }],
        };
        const mutationResponse = {
            isSuccessful: () => true,
        };
        recordsService.getDeletedRecordMeta.resolves({ redboxOid: 'record-1', metaMetadata: { brandId: 'brand-1' } });
        recordsService.restoreRecord.resolves(mutationResponse);
        recordsService.destroyDeletedRecord.resolves(mutationResponse);
        const req = makeThrowingRequest({
            params: { oid: 'record-1' },
            query: {},
            body: {},
            files: {},
        }, {
            user: { username: 'tester', roles: [{ branding: 'brand-1' }] },
        });
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.restoreRecord(req, {} as Sails.Res);
        await controller.destroyDeletedRecord(req, {} as Sails.Res);

        expect(recordsService.getDeletedRecordMeta.callCount).to.equal(2);
        expect(recordsService.getDeletedRecordMeta.firstCall.args).to.deep.equal(['record-1']);
        expect(recordsService.restoreRecord.calledWith('record-1')).to.be.true;
        expect(recordsService.destroyDeletedRecord.calledWith('record-1')).to.be.true;
        expect(sendRespStub.callCount).to.equal(2);
    });

    it('does not mutate deleted records outside the active brand', async () => {
        recordsService.getDeletedRecords.resolves({
            isSuccessful: () => true,
            items: [],
        });
        const req = makeThrowingRequest({
            params: { oid: 'other-record' },
            query: {},
            body: {},
            files: {},
        }, {
            user: { username: 'tester', roles: [] },
        });
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.restoreRecord(req, {} as Sails.Res);

        expect(recordsService.restoreRecord.called).to.be.false;
        expect(sendRespStub.firstCall.args[2].status).to.equal(404);
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).BrandingService = originalBrandingService;
        (global as any).RecordTypesService = originalRecordTypesService;
        (global as any).WorkflowStepsService = originalWorkflowStepsService;
        (global as any).HarvestRunService = originalHarvestRunService;
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

        it('preserves the literal v1 error body for all permission mutation failures', async function () {
            const cases = [...userPermissionCases, ...rolePermissionCases];
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            for (const testCase of cases) {
                recordsService.getMeta.resetHistory();
                recordsService.updateMeta.resetHistory();
                sendRespStub.resetHistory();
                recordsService.getMeta.resolves({
                    authorization: cloneAuthorization(testCase.initialAuthorization),
                });
                recordsService.updateMeta.resolves(notSavedResult());
                const req = makeThrowingRequest({
                    params: { oid: 'record-1' },
                    query: {},
                    body: testCase.body,
                    files: {},
                }, {
                    headers: { 'x-redbox-api-version': '1.0' },
                });

                await (controller as any)[testCase.method](req, {} as Sails.Res);

                const envelope = sendRespStub.firstCall.args[2];
                expect(envelope.status, testCase.name).to.equal(500);
                expect(envelope.displayErrors, testCase.name).to.equal(undefined);
                expect(envelope.meta, testCase.name).to.equal(undefined);
                expect(envelope.v1, testCase.name).to.deep.equal({
                    message: 'Failed to update record with oid record-1.',
                });
            }
        });
    });

    describe('metadata handlers', () => {
        it('passes req.apiRequest metadata separately so attachment diffs use the persisted baseline', async () => {
            const body = {
                title: 'Validated title',
                tags: ['incoming'],
                nested: { value: 2 },
                enabledValidationGroups: ['client-selected-group'],
            };
            const record = {
                metadata: {
                    title: 'Existing title',
                    tags: ['existing'],
                    nested: { value: 1 },
                },
                metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
            };
            recordsService.getMeta.resolves(record);
            recordsService.updateMeta.resolves(successResult());
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: { merge: true, datastreams: true, operation: 'submit' },
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.updateMeta(req, {} as Sails.Res);

            expect(recordsService.updateMeta.calledOnce).to.be.true;
            const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
            const updatedMetadata = recordsService.updateMeta.firstCall.args[7] as any;
            expect(updatedRecord.metadata.tags).to.deep.equal(['existing']);
            expect(updatedMetadata.tags).to.deep.equal(['existing', 'incoming']);
            expect(updatedMetadata.nested.value).to.equal(2);
            const context = recordsService.updateMeta.firstCall.args[8] as any;
            expect(context.operation).to.equal('update');
            expect(context.validationOperation).to.equal('submit');
            expect(context).not.to.have.property('enabledValidationGroups');
            expect(sendRespStub.calledOnce).to.be.true;
        });

        for (const apiVersion of ['1.0', '2.0']) {
            it(`returns the ${apiVersion} failure status and envelope for a confirmed non-save`, async () => {
                const result = new RecordSaveResponse(createRecordSaveContext({ requestId: '00000000-0000-4000-8000-000000000001' }));
                result.outcome = 'not-saved';
                result.success = false;
                result.message = '@dmpt-form-save-error';
                result.problems = [{
                    kind: 'validation',
                    phase: 'pre-save',
                    issues: [{ message: '@dmpt-form-save-error', code: 'validation-failed' }],
                }];
                recordsService.getMeta.resolves({ metadata: {}, metaMetadata: { attachmentFields: [], brandId: 'brand-1' } });
                recordsService.updateMeta.resolves(result);
                const req = makeThrowingRequest({
                    params: { oid: 'record-1' },
                    query: { merge: false, datastreams: false },
                    body: { title: 'Rejected' },
                    files: {},
                }, {
                    headers: { 'x-redbox-api-version': apiVersion },
                });
                const sendRespStub = sinon.stub(controller as any, 'sendResp');

                await controller.updateMeta(req, {} as Sails.Res);

                const envelope = sendRespStub.firstCall.args[2];
                expect(envelope.status).to.equal(apiVersion === '2.0' ? 400 : 500);
                if (apiVersion === '1.0') {
                    expect(envelope.displayErrors).to.equal(undefined);
                    expect(envelope.meta).to.equal(undefined);
                    expect(envelope.v1).to.deep.equal({ message: 'Update Metadata failed' });
                } else {
                    expect(envelope.meta.outcome).to.equal('not-saved');
                    expect(envelope.v1).to.equal(undefined);
                    expect(envelope.displayErrors).to.deep.equal([{ detail: 'Update Metadata failed' }]);
                }
            });
        }

        it('uses req.apiRequest body in updateObjectMeta', async () => {
            const body = {
                kind: 'object-meta',
                source: 'validated',
            };
            const record = {
                metaMetadata: { kind: 'original', brandId: 'brand-1' },
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

        it('preserves the literal v1 error body for an object-metadata failure', async () => {
            recordsService.getMeta.resolves({
                redboxOid: 'record-1',
                metadata: {},
                metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
            });
            recordsService.updateMeta.resolves(notSavedResult());
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: {},
                body: { type: 'dataset' },
                files: {},
            }, {
                headers: { 'x-redbox-api-version': '1.0' },
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.updateObjectMeta(req, {} as Sails.Res);

            const envelope = sendRespStub.firstCall.args[2];
            expect(envelope.status).to.equal(500);
            expect(envelope.displayErrors).to.equal(undefined);
            expect(envelope.meta).to.equal(undefined);
            expect(envelope.v1).to.deep.equal({ message: 'Update Object Metadata failed' });
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
                    enabledValidationGroups: ['client-selected-group'],
                },
            };
            recordsService.create.resolves(successResult('created-record'));
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: { operation: 'publish' },
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
            const context = recordsService.create.firstCall.args[7] as any;
            expect(context.operation).to.equal('create');
            expect(context.validationOperation).to.equal('publish');
            expect(context).not.to.have.property('enabledValidationGroups');
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(201);
            expect(sendRespStub.firstCall.args[2]?.headers?.Location).to.equal(
                'https://portal.example/default/default/api/records/metadata/created-record'
            );
        });

        it('preserves targeted-create intent when the requested workflow step has not resolved yet', async () => {
            recordsService.create.resolves(notSavedResult());
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body: {
                    workflowStage: 'missing-step',
                    metadata: { title: 'Target must resolve at the service boundary' },
                },
                files: {},
            });
            sinon.stub(controller as any, 'sendResp');

            await controller.create(req, {} as Sails.Res);
            await flushPromises();

            expect(recordsService.create.calledOnce).to.equal(true);
            expect(recordsService.create.firstCall.args[6]).to.equal('missing-step');
            expect(recordsService.create.firstCall.args[7]).to.include({
                routeFamily: 'api',
                operation: 'transition',
                targetStep: 'missing-step',
            });
        });

        it('keeps omitted operations optional on create and update', async () => {
            recordsService.create.resolves(successResult('created-record'));
            const createReq = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body: { metadata: { title: 'Created' } },
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.create(createReq, {} as Sails.Res);
            await flushPromises();

            expect((recordsService.create.firstCall.args[7] as any).validationOperation).to.equal(undefined);
            recordsService.getMeta.resolves({ metadata: {}, metaMetadata: { attachmentFields: [], brandId: 'brand-1' } });
            recordsService.updateMeta.resolves(successResult());
            const updateReq = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: {},
                body: { title: 'Updated' },
                files: {},
            });
            await controller.updateMeta(updateReq, {} as Sails.Res);

            expect((recordsService.updateMeta.firstCall.args[8] as any).validationOperation).to.equal(undefined);
            expect(sendRespStub.callCount).to.equal(2);
        });

        it('maps transition operation independently and preserves v2 authorization status', async () => {
            const record = {
                redboxOid: 'record-1',
                metadata: { title: 'Record' },
                metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
                workflow: { stage: 'draft' },
            };
            recordsService.getMeta.resolves(record);
            (global as any).WorkflowStepsService.get.returns(of({ name: 'published', config: { form: 'dataset-published' } }));
            const result = new RecordSaveResponse(createRecordSaveContext({
                requestId: '00000000-0000-4000-8000-000000000002',
            }));
            result.outcome = 'not-saved';
            result.problems = [{
                kind: 'authorization',
                phase: 'pre-save',
                issues: [{ code: 'record-validation-operation-unauthorized', message: '@record-save-record-validation-operation-unauthorized' }],
            }];
            recordsService.updateMeta.resolves(result);
            const req = makeThrowingRequest({
                params: { oid: 'record-1', targetStep: 'published' },
                query: { operation: 'publish' },
                body: {},
                files: {},
            }, {
                headers: { 'x-redbox-api-version': '2.0' },
                user: { username: 'tester', roles: [{ name: 'Publisher' }] },
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.transitionWorkflow(req, {} as Sails.Res);

            const context = recordsService.updateMeta.firstCall.args[8] as any;
            expect(context).to.include({
                operation: 'transition',
                targetStep: 'published',
                validationOperation: 'publish',
            });
            expect(recordsService.updateMeta.firstCall.args[6]).to.deep.include({ name: 'published' });
            expect(sendRespStub.firstCall.args[2].status).to.equal(403);
            expect(sendRespStub.firstCall.args[2].meta.problems[0].kind).to.equal('authorization');
        });

        it('does not transition a record owned by another brand', async () => {
            recordsService.getMeta.resolves({
                redboxOid: 'record-1',
                metadata: { title: 'Foreign record' },
                metaMetadata: { type: 'dataset', brandId: 'brand-2', form: 'dataset-draft' },
                workflow: { stage: 'draft' },
            });
            const req = makeThrowingRequest({
                params: { oid: 'record-1', targetStep: 'published' },
                query: { operation: 'publish' },
                body: {},
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.transitionWorkflow(req, {} as Sails.Res);

            expect(sendRespStub.firstCall.args[2].status).to.equal(404);
            expect(recordsService.hasEditAccess.notCalled).to.equal(true);
            expect((global as any).WorkflowStepsService.get.notCalled).to.equal(true);
            expect(recordsService.updateMeta.notCalled).to.equal(true);
        });

        it('preserves the literal v1 transition failure as an HTTP 200 result body', async () => {
            const record = {
                redboxOid: 'record-1',
                metadata: { title: 'Record' },
                metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
                workflow: { stage: 'draft' },
            };
            recordsService.getMeta.resolves(record);
            (global as any).WorkflowStepsService.get.returns(of({
                name: 'published',
                config: { form: 'dataset-published' },
            }));
            const result = notSavedResult();
            result.problems = [{
                kind: 'authorization',
                phase: 'pre-save',
                issues: [{ message: '@not-authorised' }],
            }];
            recordsService.updateMeta.resolves(result);
            const req = makeThrowingRequest({
                params: { oid: 'record-1', targetStep: 'published' },
                query: { operation: 'publish' },
                body: {},
                files: {},
            }, {
                headers: { 'x-redbox-api-version': '1.0' },
                user: { username: 'tester', roles: [{ name: 'Publisher' }] },
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.transitionWorkflow(req, {} as Sails.Res);

            expect(sendRespStub.calledOnce).to.equal(true);
            expect(sendRespStub.firstCall.args[2]).to.deep.equal({
                data: result,
                v1: {
                    success: false,
                    oid: '',
                    message: '@record-save-failed',
                    data: undefined,
                    metadata: null,
                    details: undefined,
                    totalItems: 0,
                    items: [],
                },
            });
        });

        it('keeps an omitted transition operation optional', async () => {
            recordsService.getMeta.resolves({
                redboxOid: 'record-1',
                metadata: { title: 'Record' },
                metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
                workflow: { stage: 'draft' },
            });
            (global as any).WorkflowStepsService.get.returns(of({
                name: 'review',
                config: { form: 'dataset-review' },
            }));
            recordsService.updateMeta.resolves(successResult('record-1'));
            const req = makeThrowingRequest({
                params: { oid: 'record-1', targetStep: 'review' },
                query: {},
                body: {},
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.transitionWorkflow(req, {} as Sails.Res);

            const context = recordsService.updateMeta.firstCall.args[8] as any;
            expect(context).to.include({ operation: 'transition', targetStep: 'review' });
            expect(context.validationOperation).to.equal(undefined);
            expect(sendRespStub.calledOnce).to.equal(true);
        });

        it('keeps operation contract failures sanitized and v1-compatible', async () => {
            const result = new RecordSaveResponse(createRecordSaveContext({
                requestId: '00000000-0000-4000-8000-000000000003',
            }));
            result.outcome = 'not-saved';
            result.problems = [{
                kind: 'validation',
                phase: 'pre-save',
                issues: [{ code: 'record-validation-operation-invalid', message: '@record-save-record-validation-operation-invalid' }],
            }];
            recordsService.getMeta.resolves({ metadata: {}, metaMetadata: { attachmentFields: [], brandId: 'brand-1' } });
            recordsService.updateMeta.resolves(result);
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: { operation: 'UnknownCaseSensitiveName' },
                body: { title: 'Rejected' },
                files: {},
            }, {
                headers: { 'x-redbox-api-version': '1.0' },
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.updateMeta(req, {} as Sails.Res);

            const envelope = sendRespStub.firstCall.args[2];
            expect(envelope.status).to.equal(500);
            expect(envelope.displayErrors).to.equal(undefined);
            expect(envelope.meta).to.equal(undefined);
            expect(envelope.v1).to.deep.equal({ message: 'Update Metadata failed' });
            expect(JSON.stringify(envelope)).not.to.include('UnknownCaseSensitiveName');
        });
    });

    describe('deleted record handlers', () => {
        it('does not restore an active record when no deleted record exists', async () => {
            recordsService.getMeta.resolves({
                metaMetadata: { brandId: 'brand-1', type: 'dataset' },
            });
            recordsService.getDeletedRecordMeta.resolves(null);
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: {},
                body: {},
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.restoreRecord(req, {} as Sails.Res);

            expect(recordsService.getDeletedRecordMeta.calledOnceWithExactly('record-1')).to.be.true;
            expect(recordsService.getMeta.called).to.be.false;
            expect(recordsService.restoreRecord.called).to.be.false;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
        });

        it('does not permanently delete an active record when no deleted record exists', async () => {
            recordsService.getMeta.resolves({
                metaMetadata: { brandId: 'brand-1', type: 'dataset' },
            });
            recordsService.getDeletedRecordMeta.resolves(null);
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: {},
                body: {},
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.destroyDeletedRecord(req, {} as Sails.Res);

            expect(recordsService.getDeletedRecordMeta.calledOnceWithExactly('record-1')).to.be.true;
            expect(recordsService.getMeta.called).to.be.false;
            expect(recordsService.destroyDeletedRecord.called).to.be.false;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
        });
        for (const method of ['restoreRecord', 'destroyDeletedRecord'] as const) {
            it(`rejects ${method} when the deleted record belongs to another brand`, async () => {
                recordsService.getDeletedRecordMeta.resolves({
                    redboxOid: 'record-1',
                    metaMetadata: { brandId: 'brand-2' },
                });
                const req = makeThrowingRequest({
                    params: { oid: 'record-1' },
                    query: {},
                    body: {},
                    files: {},
                });
                const sendRespStub = sinon.stub(controller as any, 'sendResp');

                await controller[method](req, {} as Sails.Res);

                expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
                expect(recordsService[method].called).to.be.false;
            });
        }

        it('propagates deleted-record storage failures', async () => {
            recordsService.getDeletedRecordMeta.rejects(new Error('storage unavailable'));
            const req = makeThrowingRequest({
                params: { oid: 'record-1' },
                query: {},
                body: {},
                files: {},
            });

            let caught: unknown;
            try {
                await controller.restoreRecord(req, {} as Sails.Res);
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.an('error').with.property('message', 'storage unavailable');
            expect(recordsService.restoreRecord.called).to.be.false;
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
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.harvest(req, {} as Sails.Res);

            expect((global as any).HarvestRunService.submitCompatibilityRecords.calledOnce).to.be.true;
            expect((global as any).HarvestRunService.submitCompatibilityRecords.firstCall.args[2]).to.deep.equal(body);
            expect(sendRespStub.calledOnce).to.be.true;
        });

        it('delegates tracked harvest bodies to HarvestRunService.submitChunk', async () => {
            const body = {
                sourceRunId: 'source-run-1',
                sourceName: 'source-a',
                chunk: { index: 1 },
                records: [
                    {
                        harvestId: 'harvest-1',
                        operation: 'upsert',
                        recordRequest: {
                            metadata: {
                                title: 'Tracked metadata',
                            },
                        },
                    },
                ],
            };
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.harvest(req, {} as Sails.Res);

            expect((global as any).HarvestRunService.submitChunk.calledOnce).to.be.true;
            expect((global as any).HarvestRunService.submitChunk.firstCall.args[2]).to.deep.equal(body);
            expect(sendRespStub.calledOnce).to.be.true;
        });

        it('rejects tracked harvest requests that also specify updateMode', async () => {
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: { updateMode: 'merge' },
                body: {
                    sourceRunId: 'source-run-1',
                    sourceName: 'source-a',
                    chunk: { index: 1 },
                    records: [{ harvestId: 'harvest-1' }],
                },
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.harvest(req, {} as Sails.Res);

            expect((global as any).HarvestRunService.submitChunk.called).to.be.false;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
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
            const req = makeThrowingRequest({
                params: { recordType: 'dataset' },
                query: {},
                body,
                files: {},
            });
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.legacyHarvest(req, {} as Sails.Res);

            expect((global as any).HarvestRunService.submitLegacyRecords.calledOnce).to.be.true;
            expect((global as any).HarvestRunService.submitLegacyRecords.firstCall.args[2]).to.deep.equal(body);
            expect(sendRespStub.calledOnce).to.be.true;
        });
    });
});

describe('Webservice RecordController getMeta', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalUnderscore: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalUnderscore = (global as any)._;

    (global as any).sails = {
      config: {},
      services: {
        recordsservice: {
          getMeta: sinon.stub(),
          getRelatedRecords: sinon.stub(),
          hasViewAccess: sinon.stub(),
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any)._ = require('lodash');

    controller = new Controllers.Record();
    controller.init();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any)._ = originalUnderscore;
  });

  it('returns metadata only when relationships are not requested', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      apiRequest: {
        params: { oid: 'oid-1' },
        query: {},
        body: {},
        files: {},
      },
      query: {},
      session: { branding: 'default' },
      user: { roles: [] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = { metadata: { title: 'Test' } };
    (global as any).sails.services.recordsservice.getMeta.resolves(record);

    await controller.getMeta(req, res);

    assert.equal((global as any).sails.services.recordsservice.getMeta.calledWith('oid-1'), true);
    assert.equal((global as any).sails.services.recordsservice.getRelatedRecords.called, false);
    assert.equal(sendResp.calledOnce, true);
    assert.deepEqual(sendResp.firstCall.args[2], { data: record.metadata });
  });

  it('returns record permissions when view access is allowed', async () => {
    const req = {
      apiRequest: { params: { oid: 'oid-1' }, query: {}, body: {}, files: {} },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = { authorization: { view: ['tester'] } };
    (global as any).sails.services.recordsservice.getMeta.resolves(record);
    (global as any).sails.services.recordsservice.hasViewAccess.returns(true);

    await controller.getPermissions(req, {} as Sails.Res);

    assert.deepEqual(sendResp.firstCall.args[2], { data: record.authorization });
  });

  it('rejects record permission access when view access is denied', async () => {
    const req = {
      apiRequest: { params: { oid: 'oid-1' }, query: {}, body: {}, files: {} },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).sails.services.recordsservice.getMeta.resolves({ authorization: {} });
    (global as any).sails.services.recordsservice.hasViewAccess.returns(false);

    await controller.getPermissions(req, {} as Sails.Res);

    assert.equal(sendResp.firstCall.args[2].status, 403);
  });

  it('returns not found when record permission metadata is missing', async () => {
    const req = {
      apiRequest: { params: { oid: 'oid-1' }, query: {}, body: {}, files: {} },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).sails.services.recordsservice.getMeta.resolves(null);

    await controller.getPermissions(req, {} as Sails.Res);

    assert.equal(sendResp.firstCall.args[2].status, 404);
  });

  it('returns filtered relationships when requested', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      apiRequest: {
        params: { oid: 'oid-1' },
        query: {
          include: 'relationships',
          relationshipDepth: '2',
          relationshipIds: 'rel-1, rel-2',
          recordTypes: 'dataset,publication',
          fields: 'summary',
        },
        body: {},
        files: {},
      },
      query: {
        include: 'relationships',
        relationshipDepth: '2',
        relationshipIds: 'rel-1, rel-2',
        recordTypes: 'dataset,publication',
        fields: 'summary',
      },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Researcher' }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = { metadata: { title: 'Test' } };
    const relationships = {
      rootOid: 'oid-1',
      relatedObjects: {
        dataset: [
          { redboxOid: 'oid-1', title: 'Root' },
          { redboxOid: 'oid-2', title: 'Visible' },
          { redboxOid: 'oid-3', title: 'Hidden' },
        ],
      },
      edges: [
        { relationId: 'rel-1', targetOid: 'oid-2' },
        { relationId: 'rel-2', targetOid: 'oid-3' },
      ],
      omittedByAccess: {},
    };

    (global as any).sails.services.recordsservice.getMeta.resolves(record);
    (global as any).sails.services.recordsservice.getRelatedRecords.resolves(relationships);
    (global as any).sails.services.recordsservice.hasViewAccess
      .withArgs(sinon.match.any, sinon.match.any, sinon.match.any, sinon.match({ redboxOid: 'oid-2', title: 'Visible' }))
      .returns(true);
    (global as any).sails.services.recordsservice.hasViewAccess
      .withArgs(sinon.match.any, sinon.match.any, sinon.match.any, sinon.match({ redboxOid: 'oid-3', title: 'Hidden' }))
      .returns(false);

    await controller.getMeta(req, res);

    assert.equal((global as any).sails.services.recordsservice.getRelatedRecords.calledOnce, true);
    assert.deepEqual((global as any).sails.services.recordsservice.getRelatedRecords.firstCall.args[2], {
      depth: 2,
      includeRelationIds: ['rel-1', 'rel-2'],
      includeRecordTypes: ['dataset', 'publication'],
      fields: 'summary',
    });
    assert.equal(sendResp.calledOnce, true);
    assert.deepEqual(sendResp.firstCall.args[2], {
      data: {
        metadata: record.metadata,
        relationships: {
          rootOid: 'oid-1',
          relatedObjects: {
            dataset: [
              { redboxOid: 'oid-1', title: 'Root' },
              { redboxOid: 'oid-2', title: 'Visible' },
            ],
          },
          edges: [
            { relationId: 'rel-1', targetOid: 'oid-2' },
          ],
          omittedByAccess: {
            'rel-2': 1,
          },
        },
      },
    });
});
});
