let expect: Chai.ExpectStatic;
import('chai').then(module => (expect = module.expect));
import * as sinon from 'sinon';
import {
  emitRecordConcurrencyEvent,
  recordConcurrencyMetricLabels,
  type RecordConcurrencyEvent,
} from '../../src/RecordConcurrencyObservability';

describe('RecordConcurrencyObservability', () => {
  const event = (overrides: Partial<RecordConcurrencyEvent> = {}): RecordConcurrencyEvent => ({
    kind: 'save-outcome',
    routeFamily: 'api',
    writeKind: 'update',
    recordType: 'rdmp',
    phase: 'persistence',
    outcome: 'not-saved',
    mode: 'strict',
    expectedRevision: 4,
    currentRevision: 5,
    precondition: 'stale',
    problemKind: 'conflict',
    problemCode: 'record-revision-stale',
    resolution: 'direct',
    errorType: 'MongoServerError',
    ...overrides,
  });

  it('logs only the bounded structured contract without record identifiers or exception values', () => {
    const warn = sinon.stub();
    const info = sinon.stub();
    const extendedEvent = Object.assign(event(), {
      oid: 'private-record-oid',
      record: { metadata: { title: 'private record value' } },
      headers: { authorization: 'Bearer secret-token' },
      credentials: { password: 'secret-password' },
      path: '/private/storage/path',
      exception: 'arbitrary private exception text',
    });
    const emitted = emitRecordConcurrencyEvent(extendedEvent, { info, warn });

    expect(Object.isFrozen(emitted)).to.equal(true);
    expect(warn.calledOnce).to.equal(true);
    expect(info.notCalled).to.equal(true);
    expect(warn.firstCall.args[1]).to.deep.equal({ event: 'record_concurrency_event', ...event() });
    expect(emitted).to.deep.equal(event());
    expect(warn.firstCall.args[1].recordType).to.equal('rdmp');
    const serialized = JSON.stringify(warn.firstCall.args[1]);
    for (const forbidden of [
      'oid',
      'username',
      'requestId',
      '11111111-1111-4111-8111-111111111111',
      'metadata',
      'headers',
      'fieldPath',
      'stack',
      'password',
      'private-record-oid',
      'private record value',
      'secret-token',
      '/private/storage/path',
      'arbitrary private exception text',
    ]) {
      expect(serialized).not.to.contain(forbidden);
    }
  });

  it('logs routine successful telemetry below WARN while retaining the same privacy-safe shape', () => {
    const warn = sinon.stub();
    const info = sinon.stub();
    const successful = event({
      outcome: 'saved',
      phase: 'response',
      expectedRevision: 4,
      currentRevision: 5,
      precondition: 'matching',
      problemKind: undefined,
      problemCode: undefined,
      errorType: undefined,
    });

    emitRecordConcurrencyEvent(successful, { info, warn });

    expect(warn.notCalled).to.equal(true);
    expect(info.calledOnce).to.equal(true);
    const expectedLog = Object.fromEntries(
      Object.entries(successful).filter(([, value]) => value !== undefined)
    );
    expect(info.firstCall.args[1]).to.deep.equal({ event: 'record_concurrency_event', ...expectedLog });
  });

  it('never promotes request, actor, revision, OID, or arbitrary problem values to metric labels', () => {
    const labels = recordConcurrencyMetricLabels(event({ problemCode: 'unbounded-extension-code' }));

    expect(labels).to.deep.equal({
      event_kind: 'save-outcome',
      route_family: 'api',
      write_kind: 'update',
      phase: 'persistence',
      outcome: 'not-saved',
      precondition: 'stale',
      mode: 'strict',
      problem_code: 'other',
      resolution: 'direct',
    });
    for (const forbidden of ['oid', 'username', 'request_id', 'revision', 'field_path', 'actor', 'record_type']) {
      expect(labels).not.to.have.property(forbidden);
    }
  });

  it('bounds every runtime-extensible metric dimension', () => {
    const labels = recordConcurrencyMetricLabels({
      ...event(),
      kind: 'plugin-event-kind',
      routeFamily: 'plugin-route-family',
      writeKind: 'plugin-write-kind',
      phase: 'plugin-phase',
      outcome: 'plugin-outcome',
      precondition: 'plugin-precondition',
      mode: 'plugin-mode',
      resolution: 'plugin-resolution',
      problemCode: 'plugin-problem-code',
    } as unknown as RecordConcurrencyEvent);

    expect(labels).to.deep.equal({
      event_kind: 'other',
      route_family: 'other',
      write_kind: 'other',
      phase: 'other',
      outcome: 'other',
      precondition: 'other',
      mode: 'other',
      problem_code: 'other',
      resolution: 'other',
    });
  });

  it('bounds runtime-extensible structured log dimensions without leaking hook values', () => {
    const warn = sinon.stub();
    const info = sinon.stub();
    const emitted = emitRecordConcurrencyEvent({
      ...event(),
      kind: 'hook-kind',
      routeFamily: 'hook-route',
      writeKind: 'hook-write',
      recordType: '../../private record',
      phase: 'hook-phase',
      outcome: 'hook-outcome',
      mode: 'hook-mode',
      expectedRevision: Number.POSITIVE_INFINITY,
      currentRevision: -1,
      precondition: 'hook-precondition',
      problemKind: 'hook-problem-kind',
      problemCode: 'hook-problem-code/private-value',
      resolution: 'hook-resolution',
      errorType: 'Error\nprivate-value',
    } as unknown as RecordConcurrencyEvent, { info, warn });

    expect(emitted).to.deep.equal({
      kind: 'other',
      routeFamily: 'other',
      writeKind: 'other',
      recordType: 'unavailable',
      phase: 'other',
      outcome: 'other',
      mode: 'other',
      precondition: 'other',
      problemKind: 'other',
      problemCode: 'other',
      resolution: 'other',
      errorType: 'other',
    });
    expect(JSON.stringify(warn.firstCall.args[1])).not.to.contain('private-value');
  });

  it('preserves certified concurrency problem codes in structured logs', () => {
    const certifiedCodes = [
      'record-precondition-required',
      'record-revision-stale',
      'record-deleted',
      'record-concurrency-capability-unavailable',
      'form-definition-changed',
      'record-lifecycle-operation-conflict',
    ];

    for (const problemCode of certifiedCodes) {
      const warn = sinon.stub();
      const emitted = emitRecordConcurrencyEvent(event({ problemCode }), { info: sinon.stub(), warn });
      expect(emitted.problemCode).to.equal(problemCode);
    }
  });
});
