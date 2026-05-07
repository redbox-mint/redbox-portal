import { firstValueFrom } from 'rxjs';

describe('The RecordsService', function () {
  this.timeout(60_000);

  let recordsService;
  const createdOids: string[] = [];
  const createdUserIds: string[] = [];

  before(function () {
    recordsService = sails.services.recordsservice;
    if (typeof recordsService.getServices === 'function') {
      recordsService.getServices(recordsService);
    }
  });

  afterEach(async function () {
    if (createdOids.length > 0) {
      const oidsToDelete = createdOids.splice(0, createdOids.length);
      if (typeof RecordAudit !== 'undefined') {
        await RecordAudit.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
      if (typeof DeletedRecord !== 'undefined') {
        await DeletedRecord.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
      if (typeof Record !== 'undefined') {
        await Record.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
    }

    if (createdUserIds.length > 0) {
      const userIds = createdUserIds.splice(0, createdUserIds.length);
      if (typeof User !== 'undefined') {
        await User.destroy({ id: userIds });
      }
    }
  });

  it('resolves record permissions to user summaries and preserves pending access metadata', async function () {
    const suffix = Date.now().toString();
    const editorUsername = `recordaudit-editor-${suffix}`;
    const viewerUsername = `recordaudit-viewer-${suffix}`;

    const editor = await firstValueFrom(
      UsersService.addLocalUser(editorUsername, 'Record Audit Editor', `${editorUsername}@example.edu.au`, 'RBTest123!')
    );
    const viewer = await firstValueFrom(
      UsersService.addLocalUser(viewerUsername, 'Record Audit Viewer', `${viewerUsername}@example.edu.au`, 'RBTest123!')
    );
    createdUserIds.push(String(editor.id), String(viewer.id));

    const brand = BrandingService.getDefault();
    const requestedOid = `records-service-permissions-${suffix}`;

    const createResponse = await recordsService.create(
      brand,
      {
        redboxOid: requestedOid,
        metadata: {
          title: 'RecordsService permission summary integration test',
        },
        workflow: {
          stage: 'draft',
          name: 'Draft',
        },
        metaMetadata: {
          type: 'rdmp',
          packageType: 'rdmp',
          brandId: brand.id,
          createdBy: 'admin',
          searchCore: 'default',
          form: 'default-1.0-draft',
          attachmentFields: [],
        },
        authorization: {
          edit: [editorUsername, 'missing-record-audit-user'],
          view: [viewerUsername],
          editRoles: ['Admin'],
          viewRoles: ['Librarians'],
          editPending: ['pending-edit@example.edu.au'],
          viewPending: ['pending-view@example.edu.au'],
        },
      },
      null,
      { username: 'admin' },
      false,
      false
    );

    expect(createResponse.isSuccessful()).to.equal(true);
    const oid = String(createResponse.oid);
    createdOids.push(oid);

    const summary = await recordsService.getResolvedPermissionsSummary(oid);

    expect(summary.edit).to.deep.equal([
      {
        username: editorUsername,
        name: 'Record Audit Editor',
        email: `${editorUsername}@example.edu.au`,
      },
      {
        username: 'missing-record-audit-user',
        name: '',
        email: '',
      },
    ]);
    expect(summary.view).to.deep.equal([
      {
        username: viewerUsername,
        name: 'Record Audit Viewer',
        email: `${viewerUsername}@example.edu.au`,
      },
    ]);
    expect(summary.editRoles).to.deep.equal(['Admin']);
    expect(summary.viewRoles).to.deep.equal(['Librarians']);
    expect(summary.editPending).to.deep.equal(['pending-edit@example.edu.au']);
    expect(summary.viewPending).to.deep.equal(['pending-view@example.edu.au']);
  });
});
