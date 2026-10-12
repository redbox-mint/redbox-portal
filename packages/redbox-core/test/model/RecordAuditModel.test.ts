import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { getRecordAuditTimestamp, RecordAuditActionType, RecordAuditModel } from '../../src/model/storage/RecordAuditModel';

describe('Record audit event timestamps', () => {
  it('captures update time from the saved snapshot before queue processing', () => {
    const audit = new RecordAuditModel('oid', { metaMetadata: { lastSaveDate: '2026-03-01T12:00:00Z' } }, null);
    assert.equal(audit.occurredAt, '2026-03-01T12:00:00Z');
  });

  it('captures deletion time rather than the snapshot last save time', () => {
    const clock = sinon.useFakeTimers(new Date('2026-03-02T12:00:00Z'));
    try {
      const audit = new RecordAuditModel('oid', { lastSaveDate: '2026-03-01T12:00:00Z' }, null, RecordAuditActionType.deleted);
      clock.tick(4 * 60 * 60 * 1000);
      assert.equal(audit.occurredAt, '2026-03-02T12:00:00.000Z');
    } finally {
      clock.restore();
    }
  });

  it('prefers explicit event time over snapshot and insertion dates', () => {
    assert.equal(getRecordAuditTimestamp({ occurredAt: '2026-03-01T12:00:00Z', action: 'updated', record: { lastSaveDate: '2026-03-02T12:00:00Z' }, createdAt: '2026-03-03T12:00:00Z' }), '2026-03-01T12:00:00Z');
  });

  it('resolves legacy update and creation snapshots', () => {
    assert.equal(getRecordAuditTimestamp({ action: 'updated', record: { lastSaveDate: '2026-03-01T12:00:00Z' }, createdAt: '2026-03-02T12:00:00Z' }), '2026-03-01T12:00:00Z');
    assert.equal(getRecordAuditTimestamp({ action: 'created', record: { metaMetadata: { createdOn: '2026-03-01T12:00:00Z' } } }), '2026-03-01T12:00:00Z');
  });

  it('ignores invalid dates and falls back to legacy audit timestamps', () => {
    assert.equal(getRecordAuditTimestamp({ occurredAt: 'invalid', action: 'updated', record: { lastSaveDate: '' }, createdAt: '2026-03-02T12:00:00Z' }), '2026-03-02T12:00:00Z');
    assert.equal(getRecordAuditTimestamp({ dateCreated: '2026-03-03T12:00:00Z' }), '2026-03-03T12:00:00Z');
    assert.equal(getRecordAuditTimestamp({ occurredAt: 'invalid' }), null);
  });
});
