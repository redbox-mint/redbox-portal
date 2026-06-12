let expect: Chai.ExpectStatic;
import { recordtype } from '../../src/config/recordtype.config';
import { agendaQueue } from '../../src/config/agendaQueue.config';

describe('recordtype config', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('dataPublication recordtype references publishDoiTriggerSync', function () {
    const dataPublication = (recordtype as any)['dataPublication'];
    expect(dataPublication).to.exist;

    const onCreatePost = dataPublication.hooks.onCreate.post;
    const onUpdatePost = dataPublication.hooks.onUpdate.post;

    const hasPublishDoiTriggerSync = [...onCreatePost, ...onUpdatePost].some(
      (hook: any) => hook.function === 'sails.services.doiservice.publishDoiTriggerSync'
    );
    expect(hasPublishDoiTriggerSync).to.be.true;
  });

  it('dataPublication recordtype references updateDoiTriggerSync', function () {
    const dataPublication = (recordtype as any)['dataPublication'];
    expect(dataPublication).to.exist;

    const onUpdatePre = dataPublication.hooks.onUpdate.pre;
    const onUpdatePost = dataPublication.hooks.onUpdate.post;

    const hasUpdateDoiTriggerSync = [...onUpdatePre, ...onUpdatePost].some(
      (hook: any) => hook.function === 'sails.services.doiservice.updateDoiTriggerSync'
    );
    expect(hasUpdateDoiTriggerSync).to.be.true;
  });

  it('agendaQueue config defines Figshare-PublishAfterUpload-Service job', function () {
    const jobs = (agendaQueue as any).agendaJobs ?? [];
    const figsharePublishJob = jobs.find((j: any) => j.name === 'Figshare-PublishAfterUpload-Service');
    expect(figsharePublishJob).to.exist;
    expect(figsharePublishJob.fnName).to.equal('figshareservice.publishAfterUploadFilesJob');
  });

  it('agendaQueue config defines Figshare-UploadedFilesCleanup-Service job', function () {
    const jobs = (agendaQueue as any).agendaJobs ?? [];
    const figshareCleanupJob = jobs.find((j: any) => j.name === 'Figshare-UploadedFilesCleanup-Service');
    expect(figshareCleanupJob).to.exist;
    expect(figshareCleanupJob.fnName).to.equal('figshareservice.deleteFilesFromRedbox');
  });
});
