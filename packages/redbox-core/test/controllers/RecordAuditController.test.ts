import assert from 'node:assert/strict';
import sinon from 'sinon';



import { auditActionLabelKey } from '../../src/queries/RecordAuditViews';
import { RecordAuditActionType } from '../../src/model/storage/RecordAuditModel';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('Record audit views through owned HTTP and domain composition', function () {

it('maps validation bypass audit actions to registered language-default keys', () => {
    const metadata = require('../../../../language-defaults/meta.json');
    const english = require('../../../../language-defaults/en/translation.json');
    const actions = [RecordAuditActionType.validationBypassed, RecordAuditActionType.batchValidationBypassed];

    for (const action of actions) {
      const key = auditActionLabelKey(action);
      assert.equal(key, `@record-audit-action-${action}`);
      assert.equal(metadata[key]?.contentFormat, 'plain');
      assert.equal(typeof english[key], 'string');
      assert.notEqual(english[key].trim(), '');
    }
  });
afterEach(() => sinon.restore());
});
