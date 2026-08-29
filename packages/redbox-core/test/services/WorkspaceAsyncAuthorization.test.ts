import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { firstValueFrom, of } from 'rxjs';
import * as sinon from 'sinon';
import { asScopeKey, freezeAuthorizationContext, type AuthorizationContext } from '../../src/authorization';
import { Services as AuthorizationServices } from '../../src/services/AuthorizationService';
import { Services } from '../../src/services/WorkspaceAsyncService';
import type { WorkspaceAsyncAttributes } from '../../src/waterline-models/WorkspaceAsync';

const SCOPE = asScopeKey('record.update');

function userContext(): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'user-1',
      username: 'user-one',
    },
    brand: { id: 'brand-a', name: 'Brand A', exists: true, authorized: true },
    grantedScopeKeys: [SCOPE],
    effectiveScopeKeys: [SCOPE],
  });
}

function processContext(): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'system-process',
      authMethod: 'internal',
      active: true,
      operationId: 'workspace-async:operation-1',
    },
    brand: { id: 'brand-a', name: 'Brand A', exists: true, authorized: true },
    grantedScopeKeys: [SCOPE],
    effectiveScopeKeys: [SCOPE],
  });
}

function job(): WorkspaceAsyncAttributes {
  return {
    id: 'job-1',
    name: 'Test job',
    recordType: 'rdmp',
    started_by: 'user-one',
    actorId: 'user-1',
    operationId: 'operation-1',
    branding: 'brand-a',
    requiredScope: SCOPE,
    service: 'safejobservice',
    method: 'execute',
    args: { id: 'record-1' },
    status: 'pending',
  } as WorkspaceAsyncAttributes;
}

describe('WorkspaceAsyncService authorization context', () => {
  it('allowlists targets, persists complete authority, and prevents later updates from replacing it', async () => {
    const previousSails = globalThis.sails;
    const previousModel = Reflect.get(globalThis, 'WorkspaceAsync');
    try {
      const query = { exec: (callback: (error: null, value: unknown) => void) => callback(null, {}) };
      const create = sinon.stub().returns(query);
      const update = sinon.stub().returns(query);
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        config: { ...(previousSails?.config ?? {}), workspaceAsync: { allowedOperations: ['safejobservice.execute'] } },
      };
      Reflect.set(globalThis, 'WorkspaceAsync', { create, update });
      const service = new Services.WorkspaceAsyncService();

      assert.throws(
        () =>
          service.start({
            ...job(),
            service: 'unsafe',
            method: 'run',
            username: 'user-one',
          }),
        /not allowlisted/
      );

      await firstValueFrom(
        service.start({
          ...job(),
          username: 'user-one',
        })
      );
      assert.deepEqual(create.firstCall.args[0], {
        name: 'Test job',
        started_by: 'user-one',
        recordType: 'rdmp',
        service: 'safejobservice',
        method: 'execute',
        args: { id: 'record-1' },
        status: 'started',
        actorId: 'user-1',
        operationId: 'operation-1',
        branding: 'brand-a',
        requiredScope: SCOPE,
      });

      await firstValueFrom(
        service.update('job-1', {
          status: 'finished',
          actorId: 'attacker',
          operationId: 'replacement',
          branding: 'brand-b',
          requiredScope: 'system.authorization.manage',
          service: 'unsafe',
          method: 'run',
        })
      );
      const updatePayload = update.firstCall.args[1];
      assert.equal(updatePayload.status, 'finished');
      assert.equal(typeof updatePayload.date_completed, 'string');
      for (const field of ['actorId', 'operationId', 'branding', 'requiredScope', 'service', 'method']) {
        assert.equal(updatePayload[field], undefined);
      }
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousModel === undefined) Reflect.deleteProperty(globalThis, 'WorkspaceAsync');
      else Reflect.set(globalThis, 'WorkspaceAsync', previousModel);
      sinon.restore();
    }
  });

  it('re-resolves the actor at execution and denies revoked or no-longer-allowlisted jobs', async () => {
    const previousSails = globalThis.sails;
    try {
      const target = sinon.stub().returns(of({ ok: true }));
      const authorizeAction = sinon.stub().returns({ allowed: false });
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        config: { ...(previousSails?.config ?? {}), workspaceAsync: { allowedOperations: ['safejobservice.execute'] } },
        services: {
          ...(previousSails?.services ?? {}),
          authorizationservice: {
            resolveUserContext: sinon.stub().resolves(userContext()),
            authorizeAction,
          },
          safejobservice: { execute: target },
        },
      };
      sinon
        .stub(AuthorizationServices.AuthorizationService.prototype, 'createSystemProcessContext')
        .resolves(processContext());
      const service = new Services.WorkspaceAsyncService();
      const update = sinon.stub(service, 'update').returns(of([]));

      await (
        service as unknown as { executePending: (value: WorkspaceAsyncAttributes) => Promise<void> }
      ).executePending(job());

      assert.equal(target.callCount, 0);
      assert.deepEqual(update.firstCall.args[1], {
        status: 'error',
        message: { code: 'authorization-revoked' },
      });

      update.resetHistory();
      authorizeAction.returns({ allowed: true });
      (globalThis.sails.config as Record<string, unknown>).workspaceAsync = { allowedOperations: [] };
      await (
        service as unknown as { executePending: (value: WorkspaceAsyncAttributes) => Promise<void> }
      ).executePending(job());
      assert.equal(target.callCount, 0);
      assert.deepEqual(update.firstCall.args[1], {
        status: 'error',
        message: { code: 'operation-not-allowlisted' },
      });
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      sinon.restore();
    }
  });

  it('passes constrained user/process envelopes to an allowlisted target and bounds pending scans', async () => {
    const previousSails = globalThis.sails;
    const previousModel = Reflect.get(globalThis, 'WorkspaceAsync');
    try {
      const target = sinon.stub().returns(of({ ok: true }));
      const query = { exec: (callback: (error: null, value: unknown[]) => void) => callback(null, []) };
      const limit = sinon.stub().returns(query);
      const sort = sinon.stub().returns({ limit });
      const find = sinon.stub().returns({ sort });
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        config: { ...(previousSails?.config ?? {}), workspaceAsync: { allowedOperations: ['safejobservice.execute'] } },
        services: {
          ...(previousSails?.services ?? {}),
          authorizationservice: {
            resolveUserContext: sinon.stub().resolves(userContext()),
            authorizeAction: sinon.stub().returns({ allowed: true }),
          },
          safejobservice: { execute: target },
        },
      };
      Reflect.set(globalThis, 'WorkspaceAsync', { find });
      sinon
        .stub(AuthorizationServices.AuthorizationService.prototype, 'createSystemProcessContext')
        .resolves(processContext());
      const service = new Services.WorkspaceAsyncService();
      const update = sinon.stub(service, 'update').returns(of([]));

      await (
        service as unknown as { executePending: (value: WorkspaceAsyncAttributes) => Promise<void> }
      ).executePending(job());

      assert.equal(target.callCount, 1);
      const envelope = target.firstCall.args[0];
      assert.deepEqual(envelope.args, { id: 'record-1' });
      assert.equal(envelope.authorization.principal.userId, 'user-1');
      assert.equal(envelope.operationId, 'operation-1');
      assert.equal(envelope.process.category, 'system-process');
      assert.equal(update.lastCall.args[1].status, 'finished');

      await firstValueFrom(service.pending());
      assert.equal(find.calledOnceWithExactly({ status: 'pending' }), true);
      assert.equal(sort.calledOnceWithExactly('id ASC'), true);
      assert.equal(limit.calledOnceWithExactly(100), true);
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousModel === undefined) Reflect.deleteProperty(globalThis, 'WorkspaceAsync');
      else Reflect.set(globalThis, 'WorkspaceAsync', previousModel);
      sinon.restore();
    }
  });
});
