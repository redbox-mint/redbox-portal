let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { agendaQueue, BRANDING_TYPEFACE_RECONCILE_JOB_NAME } from '../../src/config/agendaQueue.config';

describe('Agenda queue branding typeface reconciliation', function () {
  it('registers the daily orphan reconciliation job exactly once', function () {
    expect(BRANDING_TYPEFACE_RECONCILE_JOB_NAME).to.equal('BrandingTypefaceService-ReconcileAssets');
    const names = Object.keys(agendaQueue.jobs).filter(name => name === BRANDING_TYPEFACE_RECONCILE_JOB_NAME);
    expect(names).to.have.lengthOf(1);
    const job = agendaQueue.jobs[BRANDING_TYPEFACE_RECONCILE_JOB_NAME];
    expect(job.fnName).to.equal('brandingtypefaceservice.reconcileAssets');
    expect(job.backend).to.equal('mongodb');
    expect(job.schedule?.method).to.equal('every');
    expect(job.schedule?.intervalOrSchedule).to.equal('1 day');
    expect(job.schedule?.opts?.skipImmediate).to.equal(true);
    expect(job.options?.concurrency).to.equal(1);
    expect(job.options?.lockLimit).to.equal(1);
    expect(job.options?.lockLifetime).to.be.a('number').greaterThan(0);
  });

  it('invokes the tested reconciliation service method', function () {
    const { Services } = require('../../src/services/BrandingTypefaceService');
    expect(Services.BrandingTypeface.prototype.reconcileAssets).to.be.a('function');
    expect(Services.BrandingTypeface.prototype.exports).to.equal(undefined);
  });

  it('has no in-process timeout cleanup in the service', async function () {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'branding', 'BrandingTypeface.ts'),
      'utf8'
    );
    expect(source).to.not.contain('setTimeout');
    expect(source).to.not.contain('setInterval');
  });
});
