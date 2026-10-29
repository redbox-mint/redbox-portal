import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { AUTOSAVE_DEBOUNCE_MS, EditorComponent, PREVIEW_DEBOUNCE_MS, VALIDATE_DEBOUNCE_MS } from './editor.component';
import { EmailAdminDraft, EmailAdminEditorState, EmailTemplateApiError } from './email-templates.model';
import { commonProviders, editorState, historyEntry, serviceStub } from './email-templates.testing';
import { contextSchemaFixture } from './schema.fixture';

function draft(revision: number, overrides: Partial<EmailAdminDraft> = {}): EmailAdminDraft {
  return {
    subject: 'Draft subject',
    body: '<p>Draft body</p>',
    format: 'html',
    draftRevision: revision,
    baseVersion: { id: 'live-1', revision: 4 },
    restoredFromVersion: null,
    updatedBy: 'u1',
    updatedByName: 'Jo Smith',
    updatedAt: '2026-10-27T04:00:00.000Z',
    ...overrides,
  };
}

describe('EditorComponent', () => {
  let fixture: ComponentFixture<EditorComponent>;
  let component: EditorComponent;
  let api: ReturnType<typeof serviceStub>;

  beforeEach(async () => {
    api = serviceStub();
    api['saveDraft'].and.callFake(async (_id: string, content: any, rev: number | null) => ({
      draft: draft((rev ?? 0) + 1, content),
      diagnostics: [],
    }));
    await TestBed.configureTestingModule({
      imports: [EditorComponent],
      providers: commonProviders(api),
    }).compileComponents();
    fixture = TestBed.createComponent(EditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('templateId', 'publicationReview');
    fixture.componentRef.setInput('brandName', 'default');
  });

  afterEach(() => {
    component.dialog = null;
    if (!fixture.componentRef.hostView.destroyed) fixture.detectChanges();
  });

  function start(state: EmailAdminEditorState = editorState()): void {
    api['editorState'].and.callFake(async () => state);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    tick(VALIDATE_DEBOUNCE_MS);
    fixture.detectChanges();
  }

  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);
  const bodyArea = (): HTMLTextAreaElement => el('#et-body') as HTMLTextAreaElement;

  function typeBody(value: string): void {
    bodyArea().value = value;
    bodyArea().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function integrationSchema() {
    return {
      recordType: '',
      stage: '',
      precision: 'integration',
      contextKind: 'integration',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'summary'],
        properties: {
          kind: { type: 'string', enum: ['failure', 'recovery'], examples: ['recovery'] },
          title: { type: 'string', examples: ['Integration Recovery: example'] },
          summary: { type: 'string', examples: ['The integration recovered.'] },
          durationMs: { type: 'number', examples: [1000] },
        },
      },
    };
  }

  it('opens integration payload fields and sample data without requesting record types or loading the previous record', fakeAsync(() => {
    api['contextSchema'].and.resolveTo(integrationSchema());
    fixture.componentRef.setInput('initialRecord', { oid: 'old-record', title: 'Previous record' });
    start(editorState({ contextKind: 'integration' }));
    expect(api['contextSchema']).toHaveBeenCalledWith(undefined, undefined, 'publicationReview');
    expect(api['schemaTargets']).not.toHaveBeenCalled();
    expect(api['recordContext']).not.toHaveBeenCalled();
    expect(api['searchRecords']).not.toHaveBeenCalled();
    expect(el('email-templates-record-picker')).toBeNull();
    expect(el('#et-schema-type')).toBeNull();
    expect(el('.et-integration-sample').textContent).toContain('email-templates-preview-integration-sample');
    expect(el('#et-schema-status').textContent).toContain('email-templates-schema-precision-integration');
    expect(el('#et-context-imports')).toBeNull();
    expect(component.schemaFields.some(field => field.path === 'summary')).toBeTrue();
    expect(JSON.parse(component.contextText).kind).toBe('recovery');
    expect(component.contextEdited).toBeFalse();
    expect(api['preview'].calls.mostRecent().args[3]).toBe('override');
    component.previewNewDefault();
    tick();
    expect(api['preview'].calls.mostRecent().args[3]).toBe('default');
    component.onContextChange("{kind:'failure',title:'Edited',summary:'Changed',durationMs:'wrong',}");
    tick(PREVIEW_DEBOUNCE_MS);
    expect(component.contextErrors.some(error => error.path.includes('durationMs'))).toBeTrue();
    expect(JSON.parse(api['preview'].calls.mostRecent().args[2]).title).toBe('Edited');
    expect(component.contextSchemaLabel).toBe('email-templates-schema-precision-integration');
    component.onContextChange('');
    tick(PREVIEW_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(el('.et-preview-placeholder').textContent).toContain('email-templates-preview-empty-integration');
    flush();
  }));

  it('confirms replacing edited integration JSON with Reset sample and keeps samples temporary', fakeAsync(() => {
    api['contextSchema'].and.resolveTo(integrationSchema());
    start(editorState({ contextKind: 'integration' }));
    component.onContextChange('{"title":"Keep edited value"}');
    (el('.et-integration-sample button') as HTMLButtonElement).click();
    expect(component.dialog).toBe('sample');
    expect(JSON.parse(component.contextText).title).toBe('Keep edited value');
    component.confirmSample();
    expect(JSON.parse(component.contextText).title).toBe('Integration Recovery: example');
    expect(component.contextEdited).toBeFalse();
    expect(api['saveDraft']).not.toHaveBeenCalled();
    fixture.destroy();
    expect(api['previewWorkspaces'].get('publicationReview').record).toBeNull();
    flush();
  }));

  it('previews an untouched integration default as an override after saving it as a draft', fakeAsync(() => {
    api['contextSchema'].and.resolveTo(integrationSchema());
    start(editorState({ contextKind: 'integration', live: null, draft: null }));
    expect(api['preview'].calls.mostRecent().args[3]).toBe('default');
    void component.saveNow();
    tick();
    expect(api['preview'].calls.mostRecent().args[3]).toBe('override');
    flush();
  }));

  it('preserves integration JSON edited before its schema request completes', fakeAsync(() => {
    let resolve!: (schema: any) => void;
    api['contextSchema'].and.returnValue(new Promise(done => (resolve = done)));
    start(editorState({ contextKind: 'integration' }));
    component.onContextChange('{"title":"Typed while loading"}');
    resolve(integrationSchema());
    tick();
    expect(component.contextText).toBe('{"title":"Typed while loading"}');
    flush();
  }));

  it('opens live content and explains why Publish is unavailable before a draft exists', fakeAsync(() => {
    start();
    expect(bodyArea().value).toBe('<p>Line one</p>\n<p>Line two</p>');
    expect((el('#et-subject') as HTMLInputElement).value).toBe('Ready for review: {{record.metadata.title}}');
    expect(el('.et-publish').hasAttribute('disabled')).toBeTrue();
    expect(el('#et-publish-reason').textContent).toContain('email-templates-publish-blocked-no-draft');
    expect(el('.et-title-row').textContent).toContain('email-templates-badge-live-version version=4');
    flush();
  }));

  it('debounces validation and autosaves, creating then replacing the draft revision', fakeAsync(() => {
    start();
    api['validate'].calls.reset();
    typeBody('<p>One</p>');
    tick(VALIDATE_DEBOUNCE_MS - 1);
    expect(api['validate']).not.toHaveBeenCalled();
    tick(1);
    expect(api['validate']).toHaveBeenCalledTimes(1);
    tick(AUTOSAVE_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(api['saveDraft']).toHaveBeenCalledWith(
      'publicationReview',
      { subject: 'Ready for review: {{record.metadata.title}}', body: '<p>One</p>', format: 'html' },
      null
    );
    expect(component.draftRevision).toBe(1);
    expect(el('.et-title-row').textContent).toContain('email-templates-badge-draft-revision revision=1');

    typeBody('<p>Two</p>');
    tick(AUTOSAVE_DEBOUNCE_MS);
    expect(api['saveDraft'].calls.mostRecent().args[2]).toBe(1);
    expect(component.dirty).toBeFalse();
    flush();
  }));

  it('lists diagnostics with position, highlights the line and blocks publishing with the reason', fakeAsync(() => {
    const body = ['<p>', '  hello', '  Submitted by {{submitter.name}}', '</p>'].join('\n');
    start(editorState({ draft: draft(7, { body }) }));
    api['validate'].and.resolveTo([
      { code: 'INVALID_TEMPLATE', field: 'body', reason: 'UNKNOWN_CONTEXT_ROOT', line: 3, column: 18 },
    ]);
    typeBody(body + ' ');
    tick(VALIDATE_DEBOUNCE_MS);
    fixture.detectChanges();
    const diagnostics = el('#et-body-diagnostics');
    expect(diagnostics.getAttribute('aria-live')).toBe('polite');
    expect(diagnostics.textContent).toContain('email-templates-diagnostic-position line=3 column=18');
    expect(diagnostics.textContent).toContain('email-templates-diagnostic-UNKNOWN_CONTEXT_ROOT-named name=submitter');
    expect(component.bodyErrorLines).toEqual([3]);
    expect(el('.et-code-ln-flag').textContent!.trim()).toBe('3');
    expect(el('.et-publish').hasAttribute('disabled')).toBeTrue();
    expect(el('#et-publish-reason').textContent).toContain('email-templates-publish-blocked-diagnostics');
    expect(el('.et-publish').getAttribute('aria-describedby')).toBe('et-publish-reason');

    (diagnostics.querySelector('button') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(bodyArea());
    flush();
  }));

  it('translates complexity errors and blocks publication', fakeAsync(() => {
    start(editorState({ draft: draft(7) }));
    api['validate'].and.resolveTo([
      { code: 'TOO_COMPLEX', severity: 'error', field: 'body', reason: 'TOO_COMPLEX', line: 1, column: 1 },
    ]);
    typeBody('Changed template');
    tick(VALIDATE_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(el('#et-body-diagnostics').textContent).toContain('email-templates-diagnostic-TOO_COMPLEX');
    expect(el('.et-publish').hasAttribute('disabled')).toBeTrue();
    flush();
  }));

  it('UR-U01 reports a format-only change against the live/default format', fakeAsync(() => {
    start(editorState({ live: null, draft: draft(7, { ...editorState().suppliedDefault, format: 'text' }) }));
    component.openPublish();
    tick();
    expect(component.publishSummary!.changedLines).toBe(0);
    expect(component.publishSummary!.oldSubject).toBe(component.publishSummary!.newSubject);
    expect(component.publishSummary!.formatChanged).toEqual({ oldFormat: 'html', newFormat: 'text' });
    component.closeDialog();
    flush();
  }));

  it('UR-U04 restores edited JSON and the selected record per template without refetching', fakeAsync(() => {
    const original = JSON.stringify({ record: { metadata: { title: 'Original' } } });
    api['previewWorkspaces'].set('publicationReview', {
      record: { oid: 'one', title: 'One' },
      recordContextText: original,
      contextText: '{record: {metadata: {title: "Edited"}}}',
      contextConverted: false,
    });
    start();
    expect(component.record!.oid).toBe('one');
    expect(component.contextText).toContain('Edited');
    expect(component.contextEdited).toBeTrue();
    expect(api['recordContext']).not.toHaveBeenCalled();
    component.requestRecord({ oid: 'two', title: 'Two' });
    expect(component.dialog).toBe('change-record');
    component.closeDialog();
    component.onContextChange('{invalid temporary text');
    fixture.destroy();
    expect(api['previewWorkspaces'].get('publicationReview').contextText).toBe('{invalid temporary text');
    expect(api['previewWorkspaces'].get('publicationReview').record.oid).toBe('one');
    expect(api['saveDraft']).not.toHaveBeenCalled();
    flush();
  }));

  it('UR-U04 retains manual/sample data without a record and keeps templates isolated', fakeAsync(() => {
    start();
    component.onContextChange('{record: {metadata: {title: "Manual"}}}');
    fixture.destroy();
    expect(api['previewWorkspaces'].get('publicationReview').record).toBeNull();
    expect(api['previewWorkspaces'].get('publicationReview').contextText).toContain('Manual');
    expect(api['previewWorkspaces'].has('test')).toBeFalse();
    flush();
  }));

  it('confirms publishing with the subject change and changed line count, then applies the new state', fakeAsync(() => {
    start(editorState({ draft: draft(7, { subject: 'New subject', body: '<p>Line one</p>\n<p>Changed</p>' }) }));
    const published = editorState({
      live: { ...editorState().live!, subject: 'New subject', token: { id: 'live-1', revision: 5 } },
      latestVersion: 5,
    });
    api['publish'].and.resolveTo({ state: published, draftRetained: false });
    expect(component.publishDisabled).toBeFalse();
    (el('.et-publish') as HTMLButtonElement).click();
    tick();
    fixture.detectChanges();
    expect(component.dialog).toBe('publish');
    expect(component.publishSummary).toEqual({
      nextVersion: 5,
      oldSubject: 'Ready for review: {{record.metadata.title}}',
      newSubject: 'New subject',
      changedLines: 1,
      formatChanged: null,
    });
    const dialog = el('dialog[open]');
    expect(dialog.textContent).toContain('email-templates-publish-body revision=7 version=5 brand=default');
    expect(dialog.textContent).toContain('email-templates-publish-lines-changed count=1');
    (
      Array.from(dialog.querySelectorAll('button')).find(b =>
        b.textContent!.includes('publish-confirm')
      ) as HTMLButtonElement
    ).click();
    tick();
    fixture.detectChanges();
    expect(api['publish']).toHaveBeenCalledWith('publicationReview', 7, { id: 'live-1', revision: 4 });
    expect(component.dialog).toBeNull();
    expect(component.liveVersion).toBe(5);
    expect(component.hasDraft).toBeFalse();
    flush();
  }));

  it('keeps the user content on a 409, says who changed it, and reloads on request', fakeAsync(() => {
    start(editorState({ draft: draft(7) }));
    api['saveDraft'].and.rejectWith(
      new EmailTemplateApiError(409, 'REVISION_CONFLICT', [], {
        live: { token: { id: 'live-1', revision: 5 }, updatedBy: 'u2', updatedByName: 'Sam Lee', updatedAt: null },
        draft: null,
        latestVersion: 5,
        lastChange: { updatedBy: 'u2', updatedByName: 'Sam Lee', updatedAt: null },
      })
    );
    typeBody('<p>My careful edit</p>');
    tick(AUTOSAVE_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(component.dialog).toBe('conflict');
    const dialog = el('dialog[open]');
    expect(dialog.textContent).toContain('email-templates-conflict-published name=Sam Lee version=5');
    expect(dialog.textContent).toContain('email-templates-conflict-based-on version=4');
    expect((dialog.querySelector('#et-conflict-body') as HTMLTextAreaElement).value).toBe('<p>My careful edit</p>');
    expect(component.publishBlocker).toBe('email-templates-publish-blocked-conflict');

    // Further edits never overwrite the held copy or trigger saves.
    api['saveDraft'].calls.reset();
    tick(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(api['saveDraft']).not.toHaveBeenCalled();

    api['editorState'].and.resolveTo(
      editorState({ live: { ...editorState().live!, token: { id: 'live-1', revision: 5 } } })
    );
    component.reloadAfterConflict();
    tick();
    fixture.detectChanges();
    expect(component.dialog).toBeNull();
    expect(component.rescuedContent?.body).toBe('<p>My careful edit</p>');
    expect(el('.alert-warning').textContent).toContain('email-templates-rescued');
    flush();
  }));

  for (const succeeds of [true, false]) {
    it(`protects a restored conflict during Reload and ${succeeds ? 'adopts only the remote draft' : 'retains protection on failure'}`, fakeAsync(() => {
      const remote = draft(2, { body: 'Other admin latest draft A' });
      const held = { subject: 'Held subject', body: 'Held conflicting content from A', format: 'html' as const };
      const conflict = new EmailTemplateApiError(409, 'REVISION_CONFLICT');
      api['heldEdits'].set('publicationReview', { content: held, conflict });
      start(editorState({ draft: remote }));
      expect(component.content.body).toBe(held.body);
      expect(component.draftRevision).toBe(2);
      let resolve!: (state: EmailAdminEditorState) => void;
      let reject!: (error: Error) => void;
      api['editorState'].and.returnValue(
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        })
      );
      component.reloadAfterConflict();
      fixture.detectChanges();
      expect(component.busy).toBe('reload');
      expect(bodyArea().readOnly).toBeTrue();
      expect(el('dialog[open] .btn-primary').hasAttribute('disabled')).toBeTrue();
      let allowed: boolean | undefined;
      component.prepareToLeave().then(value => (allowed = value));
      component.save(true);
      component.onBodyChange('Must remain locked');
      tick(AUTOSAVE_DEBOUNCE_MS * 2);
      expect(allowed).toBeFalse();
      expect(api['saveDraft']).not.toHaveBeenCalled();
      expect(component.conflictContent?.body).toBe(held.body);
      expect(api['heldEdits'].has('publicationReview')).toBeTrue();
      if (succeeds) resolve(editorState({ draft: remote }));
      else reject(new Error('Reload unavailable'));
      tick();
      expect(component.busy).toBeNull();
      expect(component.content.body).toBe(succeeds ? remote.body : held.body);
      expect(component.conflictContent === null).toBe(succeeds);
      expect(api['heldEdits'].has('publicationReview')).toBe(!succeeds);
      if (!succeeds) {
        expect(component.dialog).toBe('conflict');
        expect(component.loadError).toBeTruthy();
        component.save(true);
      }
      expect(api['saveDraft']).not.toHaveBeenCalled();
      flush();
    }));
  }

  it('builds preview context from a picked record and previews with the JSON text', fakeAsync(() => {
    start();
    api['recordContext'].and.resolveTo({ oid: 'rec-1', record: { metadata: { title: 'Soil carbon survey 2024' } } });
    component.requestRecord({ oid: 'rec-1', title: 'Soil carbon survey 2024' });
    tick();
    fixture.detectChanges();
    expect(api['recordContext']).toHaveBeenCalledWith('rec-1', 'publicationReview');
    expect(component.contextText).toContain('\n  "record": {');
    expect(component.contextEdited).toBeFalse();
    tick(PREVIEW_DEBOUNCE_MS);
    fixture.detectChanges();
    const [, content, context] = api['preview'].calls.mostRecent().args;
    expect(content.body).toBe('<p>Line one</p>\n<p>Line two</p>');
    expect(JSON.parse(context)).toEqual({ oid: 'rec-1', record: { metadata: { title: 'Soil carbon survey 2024' } } });
    expect(el('iframe').getAttribute('sandbox')).toBe('');

    // Editing the JSON marks it, re-previews and makes changing record ask first.
    const contextArea = el('#et-context') as HTMLTextAreaElement;
    contextArea.value = context.replace('Soil carbon survey 2024', 'Edited title');
    contextArea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el('.et-context-edited')).toBeTruthy();
    tick(PREVIEW_DEBOUNCE_MS);
    expect(JSON.parse(api['preview'].calls.mostRecent().args[2]).record.metadata.title).toBe('Edited title');

    component.requestRecord({ oid: 'rec-2', title: 'Coral reef imaging' });
    fixture.detectChanges();
    expect(component.dialog).toBe('change-record');
    expect(api['recordContext']).toHaveBeenCalledTimes(1);
    component.confirmRecordChange();
    tick();
    expect(api['recordContext']).toHaveBeenCalledWith('rec-2', 'publicationReview');

    component.contextText = '{ not json';
    component.runPreview();
    fixture.detectChanges();
    expect(component.contextProblem).toBe('json');
    expect(el('#et-context-help').textContent).toContain('email-templates-context-invalid-json');
    flush();
  }));

  it('shows the sanitiser removals note', fakeAsync(() => {
    api['preview'].and.resolveTo({
      subject: 'S',
      html: '<p>x</p>',
      sanitiserRemovals: [{ element: 'script' }, { element: 'p', attribute: 'onclick' }],
      diagnostics: [],
    });
    start();
    component.contextText = '{"oid":"x"}';
    component.runPreview();
    tick();
    fixture.detectChanges();
    expect(el('.et-sanitiser-note').textContent).toContain(
      'email-templates-sanitiser-removed count=2 items=<script>, email-templates-removed-attribute name=onclick'
    );
    flush();
  }));

  it('restores a history version into the draft after confirming, then returns to editing', fakeAsync(() => {
    api['history'].and.resolveTo([historyEntry({ version: 4, live: true }), historyEntry({ version: 3 })]);
    api['restore'].and.resolveTo({
      draft: draft(9, { subject: 'Old subject', body: '<p>Old body</p>', restoredFromVersion: 3 }),
      diagnostics: [],
    });
    start(editorState({ draft: draft(8) }));
    const tab = el('#et-tab-edit') as HTMLButtonElement;
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    tick();
    fixture.detectChanges();
    expect(component.tab).toBe('history');
    expect(el('#et-tab-history').getAttribute('aria-selected')).toBe('true');
    expect(api['history']).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('et-tab-history');

    component.requestRestore(historyEntry({ version: 3 }));
    fixture.detectChanges();
    expect(component.dialog).toBe('restore');
    component.confirmRestore();
    tick(100);
    fixture.detectChanges();
    expect(api['restore']).toHaveBeenCalledWith('publicationReview', 3, 8);
    expect(component.tab).toBe('edit');
    expect(component.content.body).toBe('<p>Old body</p>');
    expect(component.draftRevision).toBe(9);
    expect(el('.et-title-row').textContent).toContain('email-templates-badge-restored-from version=3');
    flush();
  }));

  it('previews the new default and starts a draft from it after confirming', fakeAsync(() => {
    api['draftFromDefault'].and.resolveTo({
      draft: draft(9, { subject: 'Publication ready for review', body: '<p>Default body</p>' }),
      diagnostics: [],
    });
    start(editorState({ defaultUpdated: true, draft: draft(8) }));
    expect(el('.et-default-updated').textContent).toContain('email-templates-default-updated-banner version=4');
    component.contextText = '{"oid":"x"}';
    component.previewNewDefault();
    tick(1);
    expect(api['preview'].calls.mostRecent().args[1]).toEqual({
      subject: 'Publication ready for review',
      body: '<p>Default body</p>',
      format: 'html',
    });

    component.requestDraftFromDefault();
    expect(component.dialog).toBe('from-default');
    component.confirmDraftFromDefault();
    tick(100);
    expect(api['draftFromDefault']).toHaveBeenCalledWith('publicationReview', 8);
    expect(component.content.body).toBe('<p>Default body</p>');
    flush();
  }));

  it('resets with the live token and discards with the draft revision', fakeAsync(() => {
    api['reset'].and.resolveTo({
      state: editorState({ live: null, draft: draft(8), latestVersion: 5 }),
      draftRetained: false,
    });
    start(editorState({ draft: draft(8) }));
    component.openReset();
    fixture.detectChanges();
    expect(el('dialog[open]').textContent).toContain('email-templates-reset-body brand=default version=4');
    component.confirmReset();
    tick(100);
    expect(api['reset']).toHaveBeenCalledWith('publicationReview', { id: 'live-1', revision: 4 });
    expect(component.liveVersion).toBeNull();

    api['editorState'].and.resolveTo(editorState({ live: null, draft: null }));
    component.openDiscard();
    expect(component.dialog).toBe('discard');
    component.confirmDiscard();
    tick(100);
    expect(api['discardDraft']).toHaveBeenCalledWith('publicationReview', 8);
    expect(component.hasDraft).toBeFalse();
    flush();
    discardPeriodicTasks();
  }));
  it('keeps the editor open when saving before navigation fails', fakeAsync(() => {
    start();
    const back = spyOn(component.back, 'emit');
    api['saveDraft'].and.rejectWith(new EmailTemplateApiError(500, 'PERSISTENCE'));
    typeBody('<p>Unsaved work</p>');
    component.goBack();
    tick();
    expect(back).not.toHaveBeenCalled();
    expect(component.content.body).toBe('<p>Unsaved work</p>');
    expect(component.saveFailed).toBeTrue();
    flush();
  }));

  it('ignores an old validation response while newer edits are debouncing', fakeAsync(() => {
    start();
    let resolve!: (value: any[]) => void;
    api['validate'].and.returnValue(new Promise<any[]>(done => (resolve = done)));
    component.validate();
    typeBody('<p>Newer content</p>');
    resolve([{ code: 'INVALID_TEMPLATE', field: 'body', reason: 'INVALID_SYNTAX', line: 1, column: 1 }]);
    tick();
    expect(component.diagnostics).toEqual([]);
    api['validate'].and.resolveTo([]);
    flush();
  }));

  it('clears a stale preview and its busy state when context becomes invalid', fakeAsync(() => {
    start();
    let resolve!: (value: any) => void;
    api['preview'].and.returnValue(new Promise<any>(done => (resolve = done)));
    component.contextText = '{"oid":"old"}';
    component.runPreview();
    component.onContextChange('{ invalid');
    resolve({ subject: 'Old subject', html: '<p>Old record</p>', sanitiserRemovals: [], diagnostics: [] });
    tick(PREVIEW_DEBOUNCE_MS);
    expect(component.preview).toBeNull();
    expect(component.contextProblem).toBe('json');
    expect(component.previewing).toBeFalse();
    flush();
  }));
  it('ET-01 ignores a late load after its editor identity is destroyed', fakeAsync(() => {
    let resolve!: (value: EmailAdminEditorState) => void;
    api['editorState'].and.returnValue(new Promise<EmailAdminEditorState>(done => (resolve = done)));
    fixture.detectChanges();
    component.ngOnDestroy();
    resolve(editorState());
    tick();
    expect(component.state).toBeNull();
    expect(api['validate']).not.toHaveBeenCalled();
  }));

  it('ET-02/ET-03 settles the newest snapshot before hash/history navigation can destroy the editor', fakeAsync(() => {
    start();
    let resolve!: (value: any) => void;
    api['saveDraft'].and.returnValue(new Promise(done => (resolve = done)));
    typeBody('First request');
    tick(AUTOSAVE_DEBOUNCE_MS);
    typeBody('Newer typing');
    let left = false;
    component.prepareToLeave().then(value => (left = value));
    tick();
    expect(left).toBeFalse();
    api['saveDraft'].and.callFake(async (_id: string, content: any, rev: number) => ({
      draft: draft(rev + 1, content),
      diagnostics: [],
    }));
    resolve({ draft: draft(1, { body: 'First request' }), diagnostics: [] });
    tick();
    expect(left).toBeTrue();
    expect(api['saveDraft'].calls.mostRecent().args[1].body).toBe('Newer typing');
    expect(component.dirty).toBeFalse();
    flush();
  }));

  it('ET-04 aborts reset after every failed preparatory save and keeps the unsaved content', fakeAsync(() => {
    start();
    api['saveDraft'].and.rejectWith(new EmailTemplateApiError(413, 'LENGTH_LIMIT'));
    typeBody('Must keep this');
    component.openReset();
    component.confirmReset();
    tick();
    expect(api['reset']).not.toHaveBeenCalled();
    expect(component.content.body).toBe('Must keep this');
    expect(component.saveFailed).toBeTrue();
    flush();
  }));

  it('ET-05 locks dialog dismissal and editing throughout a pending mutation', fakeAsync(() => {
    start(editorState({ draft: draft(7) }));
    let resolve!: (value: any) => void;
    api['publish'].and.returnValue(new Promise(done => (resolve = done)));
    component.openPublish();
    tick();
    fixture.detectChanges();
    component.confirmPublish();
    tick();
    fixture.detectChanges();
    component.dismissDialog();
    component.closeDialog();
    component.onBodyChange('Should stay locked');
    expect(component.dialog).toBe('publish');
    expect(bodyArea().readOnly).toBeTrue();
    expect(component.content.body).toBe('<p>Draft body</p>');
    resolve({ state: editorState(), draftRetained: false });
    tick();
    flush();
    expect(component.dialog).toBeNull();
  }));

  it('ET-06 retains conflicts under their template identity when leaving', fakeAsync(() => {
    start();
    api['saveDraft'].and.rejectWith(new EmailTemplateApiError(409, 'REVISION_CONFLICT'));
    typeBody('Held conflict text');
    component.saveNow();
    tick();
    let allowed = false;
    component.prepareToLeave().then(value => (allowed = value));
    tick();
    expect(allowed).toBeTrue();
    expect(api['heldEdits'].get('publicationReview').content.body).toBe('Held conflict text');
    expect(api['heldEdits'].has('test')).toBeFalse();
    flush();
  }));

  it('ET-08 preserves JSON typed after a record-context request starts', fakeAsync(() => {
    start();
    let resolve!: (value: any) => void;
    api['recordContext'].and.returnValue(new Promise(done => (resolve = done)));
    component.loadRecord({ oid: 'b', title: 'Beta' });
    component.onContextChange('{record: {metadata: {title: "Custom"}}}');
    resolve({ oid: 'b', record: { metadata: { title: 'Beta' } } });
    tick();
    expect(component.contextText).toContain('Custom');
    expect(component.record).toBeNull();
    expect(component.recordContextText).toBeNull();
    flush();
  }));

  it('ET-09 retires old record/context/preview during selection and after a failed context load', fakeAsync(() => {
    start();
    component.loadRecord({ oid: 'a', title: 'Alpha' });
    tick();
    component.preview = { subject: 'Alpha', html: '<p>Alpha</p>', diagnostics: [], sanitiserRemovals: [] };
    let reject!: (reason: any) => void;
    api['recordContext'].and.returnValue(new Promise((_resolve, fail) => (reject = fail)));
    component.loadRecord({ oid: 'b', title: 'Beta' });
    expect(component.preview).toBeNull();
    expect(component.contextText).toBe('');
    expect(component.record).toBeNull();
    reject(new EmailTemplateApiError(403, 'FORBIDDEN'));
    tick();
    expect(component.contextLoadError).toBe('email-templates-record-unavailable');
    expect(component.recordContextText).toBeNull();
    expect(component.contextText).toBe('');
    flush();
  }));

  it('ET-10 clears preview errors when JSON is malformed or too large after the template changes', fakeAsync(() => {
    start();
    for (const context of ['{', 'x'.repeat(262145)]) {
      component.previewDiagnostics = [
        { code: 'INVALID_TEMPLATE', field: 'body', reason: 'UNKNOWN_CONTEXT_ROOT', line: 1, column: 3 },
      ];
      component.previewErrorCode = 'INVALID_TEMPLATE';
      component.onContextChange(context);
      component.onBodyChange('Fixed body');
      tick(PREVIEW_DEBOUNCE_MS);
      expect(component.previewDiagnostics).toEqual([]);
      expect(component.previewErrorCode).toBeNull();
    }
    flush();
  }));

  it('ET-13 returns focus to the visible history trigger after chained View/Restore cancellation', fakeAsync(() => {
    start(editorState({ draft: draft(7) }));
    const entry = historyEntry({ version: 3 });
    component.history = [entry];
    component.tab = 'history';
    fixture.detectChanges();
    const view = fixture.nativeElement.querySelector('email-templates-history button') as HTMLButtonElement;
    view.focus();
    component.viewVersion(entry);
    fixture.detectChanges();
    const restore = fixture.nativeElement.querySelector('dialog[open] .btn-primary') as HTMLButtonElement;
    restore.focus();
    component.requestRestore(entry);
    fixture.detectChanges();
    tick();
    component.dismissDialog();
    fixture.detectChanges();
    tick();
    expect(document.activeElement).toBe(view);
    flush();
  }));

  it('ET-14 previews strict JSON and normalises relaxed input on blur without changing source during typing', fakeAsync(() => {
    start();
    component.onContextChange("{ 'aKey':'aValue', record: {metadata: {title: 'Research',}}, }");
    tick(PREVIEW_DEBOUNCE_MS);
    expect(component.contextText).toContain("'aKey'");
    expect(api['preview'].calls.mostRecent().args[2]).toBe(
      '{"aKey":"aValue","record":{"metadata":{"title":"Research"}}}'
    );
    component.normaliseContext();
    expect(() => JSON.parse(component.contextText)).not.toThrow();
    expect(component.contextConverted).toBeTrue();
    flush();
  }));

  it('clears stale blocking diagnostics when validation fails after the source is corrected', fakeAsync(() => {
    start(editorState({ draft: draft(7) }));
    api['validate'].and.resolveTo([
      { code: 'INVALID_TEMPLATE', field: 'body', reason: 'UNCLOSED_BLOCK', severity: 'error', line: 1, column: 1 },
    ]);
    typeBody('{{#if record.metadata.title}}');
    tick(VALIDATE_DEBOUNCE_MS);
    expect(component.publishBlocker).toBe('email-templates-publish-blocked-diagnostics');
    api['validate'].and.rejectWith(new EmailTemplateApiError(403, 'FORBIDDEN'));
    typeBody('{{record.metadata.title}}');
    tick(VALIDATE_DEBOUNCE_MS);
    expect(component.diagnostics).toEqual([]);
    expect(component.bodyErrorLines).toEqual([]);
    expect(component.publishBlocker).toBeNull();
    expect(component.errorMessage).not.toBeNull();
    flush();
  }));

  it('keeps schema warnings visible after autosave and never blocks Publish', fakeAsync(() => {
    start(editorState({ draft: draft(7) }));
    api['validate'].and.resolveTo([
      { code: 'PRINTS_OBJECT', field: 'body', reason: 'PRINTS_OBJECT', severity: 'warning', line: 1, column: 3 },
    ]);
    typeBody('{{record.metadata}}');
    tick(VALIDATE_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(component.publishBlocker).toBeNull();
    expect(component.bodyErrorLines).toEqual([]);
    expect(component.bodyWarningLines).toEqual([1]);
    tick(AUTOSAVE_DEBOUNCE_MS);
    expect(component.diagnostics[0].severity).toBe('warning');
    flush();
  }));

  describe('schema assistance', () => {
    const targets = [
      {
        id: 'rdmp',
        label: 'RDMP',
        stages: [
          { id: 'draft', label: 'Draft', starting: true },
          { id: 'review', label: 'Review', starting: false },
        ],
      },
      { id: 'dataRecord', label: 'Data record', stages: [{ id: 'draft', label: 'Draft', starting: true }] },
    ];

    beforeEach(() => {
      api['schemaTargets'].and.resolveTo({ recordTypes: targets });
      api['contextSchema'].and.callFake(async (recordType: string, stage: string) => ({
        recordType,
        stage,
        precision: 'record-schema',
        schema: contextSchemaFixture(),
      }));
    });

    const key = (target: HTMLElement, name: string): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };

    it('ignores late schema successes and failures after a stage change or editor teardown', fakeAsync(() => {
      start();
      let resolveOld!: (value: unknown) => void;
      api['contextSchema'].and.returnValue(new Promise(resolve => (resolveOld = resolve)));
      void component.selectSchemaTarget({ recordType: 'rdmp', stage: 'draft' });
      const current = {
        recordType: 'rdmp',
        stage: 'review',
        precision: 'record-schema',
        completeness: 'partial',
        schema: { properties: { current: { type: 'string' } } },
      };
      api['contextSchema'].and.resolveTo(current);
      void component.selectSchemaTarget({ recordType: 'rdmp', stage: 'review' });
      tick();
      resolveOld({ ...current, stage: 'draft', schema: { properties: { stale: {} } } });
      tick();
      expect(component.contextSchema?.stage).toBe('review');
      expect(component.schemaFields.some(field => field.path === 'current')).toBeTrue();
      expect(component.schemaFields.some(field => field.path === 'stale')).toBeFalse();
      let rejectOld!: (reason: Error) => void;
      api['contextSchema'].and.returnValue(new Promise((_resolve, reject) => (rejectOld = reject)));
      void component.selectSchemaTarget({ recordType: 'rdmp', stage: 'draft' });
      component.ngOnDestroy();
      rejectOld(new Error('old editor'));
      tick();
      expect(component.schemaError).toBeFalse();
      flush();
    }));

    it('defaults the record type / stage selector, states precision and persists explicit choices', fakeAsync(() => {
      start();
      expect((el('#et-schema-type') as HTMLSelectElement).value).toBe('rdmp');
      expect(el('#et-schema-status').textContent).toContain(
        'email-templates-schema-precision-record-schema type=RDMP stage=Draft'
      );
      expect(api['schemaSelections'].has('publicationReview')).toBeFalse();
      const type = el('#et-schema-type') as HTMLSelectElement;
      type.value = 'dataRecord';
      type.dispatchEvent(new Event('change'));
      tick(VALIDATE_DEBOUNCE_MS);
      fixture.detectChanges();
      expect(api['contextSchema']).toHaveBeenCalledWith('dataRecord', 'draft', 'publicationReview');
      expect(api['schemaSelections'].get('publicationReview')).toEqual({ recordType: 'dataRecord', stage: 'draft' });
      expect(api['validate'].calls.mostRecent().args[2]).toEqual({ recordType: 'dataRecord', stage: 'draft' });
      flush();
    }));

    it('inserts field tree selections at the body caret through the normal edit path', fakeAsync(() => {
      start();
      api['validate'].calls.reset();
      bodyArea().setSelectionRange(3, 3);
      const title = Array.from(fixture.nativeElement.querySelectorAll('.et-field')).find(
        (row: any) => row.querySelector('.et-field-key').textContent.trim() === 'title'
      ) as HTMLElement;
      (title.querySelector('.et-field-name') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.content.body).toBe('<p>{{record.metadata.title}}Line one</p>\n<p>Line two</p>');
      const authors = Array.from(fixture.nativeElement.querySelectorAll('.et-field')).find(
        (row: any) => row.querySelector('.et-field-key').textContent.trim() === 'authors'
      ) as HTMLElement;
      (authors.querySelector('.et-field-name') as HTMLButtonElement).click();
      expect(component.content.body).toContain('{{#each record.metadata.authors}}\n  {{this.name}}\n{{/each}}');
      tick(VALIDATE_DEBOUNCE_MS);
      expect(api['validate']).toHaveBeenCalledTimes(1);
      flush();
    }));

    it('autocompletes in the body and subject independently, without breaking debounced validation', fakeAsync(() => {
      start(editorState({ draft: draft(7) }));
      api['validate'].calls.reset();
      typeBody('Hi {{record.metadata.ti');
      expect(fixture.nativeElement.querySelector('[role="listbox"]')).not.toBeNull();
      expect(key(bodyArea(), 'Enter').defaultPrevented).toBeTrue();
      expect(component.content.body).toBe('Hi {{record.metadata.title}}');
      tick(VALIDATE_DEBOUNCE_MS);
      expect(api['validate']).toHaveBeenCalledTimes(1);
      expect(api['validate'].calls.mostRecent().args[1].body).toBe('Hi {{record.metadata.title}}');

      const subject = el('#et-subject') as HTMLInputElement;
      subject.focus();
      subject.value = 'Ready {{o';
      subject.setSelectionRange(9, 9);
      subject.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(subject.getAttribute('aria-expanded')).toBe('true');
      key(subject, 'Tab');
      expect(component.content.subject).toBe('Ready {{oid}}');
      expect(component.content.body).toBe('Hi {{record.metadata.title}}');
      tick(AUTOSAVE_DEBOUNCE_MS);
      flush();
    }));

    it('shows warnings in amber, offers "did you mean" for that occurrence only and never blocks Publish', fakeAsync(() => {
      const body = '<p>{{record.metadata.titel}}</p>\n<p>{{record.metadata.titel}}</p>';
      start(editorState({ draft: draft(7, { body }) }));
      api['validate'].and.resolveTo([
        {
          code: 'UNKNOWN_FIELD',
          field: 'body',
          reason: 'UNKNOWN_FIELD',
          severity: 'warning',
          suggestion: 'title',
          line: 2,
          column: 6,
        },
      ]);
      typeBody(body);
      tick(VALIDATE_DEBOUNCE_MS);
      fixture.detectChanges();
      const item = el('.et-diagnostic-item');
      expect(item.classList).toContain('et-diagnostic-warning');
      expect(item.textContent).toContain('email-templates-severity-warning');
      expect(item.textContent).toContain('email-templates-warning-UNKNOWN_FIELD-named name=record.metadata.titel');
      expect(el('.et-code-mark-warning')).not.toBeNull();
      expect(el('.et-advisory').textContent).toContain('email-templates-warnings-advisory');
      expect(component.publishBlocker).toBeNull();
      expect(el('.et-publish').hasAttribute('disabled')).toBeFalse();
      expect(el('#et-publish-reason')).toBeNull();
      const fix = el('.et-diagnostic-fix') as HTMLButtonElement;
      expect(fix.querySelector('code')!.textContent).toBe('title');

      api['validate'].calls.reset();
      api['validate'].and.resolveTo([]);
      fix.click();
      fixture.detectChanges();
      expect(component.content.body).toBe('<p>{{record.metadata.titel}}</p>\n<p>{{record.metadata.title}}</p>');
      expect(el('.et-diagnostic-fix')).toBeNull();
      tick(VALIDATE_DEBOUNCE_MS);
      expect(api['validate']).toHaveBeenCalledTimes(1);
      flush();
    }));

    it('hides a "did you mean" fix once the source no longer matches the validated snapshot', fakeAsync(() => {
      const body = '{{record.metadata.titel}}';
      start(editorState({ draft: draft(7, { body }) }));
      api['validate'].and.resolveTo([
        {
          code: 'UNKNOWN_FIELD',
          field: 'body',
          reason: 'UNKNOWN_FIELD',
          severity: 'warning',
          suggestion: 'title',
          line: 1,
          column: 3,
        },
      ]);
      typeBody(body);
      tick(VALIDATE_DEBOUNCE_MS);
      fixture.detectChanges();
      expect(el('.et-diagnostic-fix')).not.toBeNull();
      typeBody('x' + body);
      expect(el('.et-diagnostic-fix')).toBeNull();
      component.applySuggestion(component.diagnostics[0]);
      expect(component.content.body).toBe('x' + body);
      flush();
    }));

    it('keeps errors red and the blocker about errors only, alongside warnings', fakeAsync(() => {
      start(editorState({ draft: draft(7) }));
      api['validate'].and.resolveTo([
        {
          code: 'INVALID_TEMPLATE',
          field: 'body',
          reason: 'UNKNOWN_CONTEXT_ROOT',
          severity: 'error',
          line: 1,
          column: 3,
        },
        { code: 'PRINTS_OBJECT', field: 'body', reason: 'PRINTS_OBJECT', severity: 'warning', line: 2, column: 3 },
      ]);
      typeBody('{{nope}}\n{{record.metadata}}');
      tick(VALIDATE_DEBOUNCE_MS);
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.et-diagnostic-item');
      expect(items[0].classList).not.toContain('et-diagnostic-warning');
      expect(items[1].classList).toContain('et-diagnostic-warning');
      expect(component.bodyErrorLines).toEqual([1]);
      expect(component.bodyWarningLines).toEqual([2]);
      expect(el('#et-publish-reason').textContent).toContain('email-templates-publish-blocked-diagnostics');
      expect(el('.et-advisory')).toBeNull();
      flush();
    }));

    it('generates sample data, confirming before replacing edited JSON and ignoring a stale schema', fakeAsync(() => {
      start();
      const sample = el('.et-context-action') as HTMLButtonElement;
      expect(sample.disabled).toBeFalse();
      sample.click();
      fixture.detectChanges();
      expect(component.dialog).toBeNull();
      expect(JSON.parse(component.contextText).record.metadata.title).toBe('Title');
      tick(PREVIEW_DEBOUNCE_MS);

      component.onContextChange('{"mine": true}');
      sample.click();
      fixture.detectChanges();
      expect(component.dialog).toBe('sample');
      component.confirmSample();
      expect(JSON.parse(component.contextText).record.metadata.authors.length).toBe(1);

      component.onContextChange('{"mine": true}');
      component.requestSample();
      component.contextSchema = { ...component.contextSchema! };
      component.confirmSample();
      expect(component.contextText).toBe('{"mine": true}');
      flush();
    }));

    it('keeps existing Context JSON and shows a safe error when sample generation cannot validate', fakeAsync(() => {
      start();
      component.contextText = '{"record":{"metadata":{"title":"Keep me"}}}';
      const original = component.contextText;
      component.contextSchema = {
        ...component.contextSchema!,
        schema: { properties: { kind: { const: 'a' } }, allOf: [{ properties: { kind: { const: 'b' } } }] },
      };
      component.requestSample();
      component.confirmSample();
      fixture.detectChanges();
      expect(component.contextText).toBe(original);
      expect(component.errorMessage?.key).toBe('email-templates-sample-failed');
      expect(el('[role="alert"]').textContent).toContain('email-templates-sample-failed');
      flush();
    }));

    it('lists Context JSON schema differences at their JSON path and notes relaxed conversion', fakeAsync(() => {
      start();
      component.onContextChange("{record: {metadata: {title: 5, extra: 'x'}}}");
      tick(PREVIEW_DEBOUNCE_MS);
      fixture.detectChanges();
      const issues = el('.et-context-issues');
      expect(issues.textContent).toContain('email-templates-context-issues count=2 type=RDMP');
      const paths = Array.from(issues.querySelectorAll('.et-context-path')).map(item => item.textContent);
      expect(paths).toEqual(['$.record.metadata.title', '$.record.metadata.extra']);
      expect(issues.textContent).toContain('email-templates-context-error-type expected=string');
      expect(issues.textContent).toContain('email-templates-context-error-additionalProperties');
      expect(component.publishBlocker).not.toBe('email-templates-publish-blocked-diagnostics');
      component.normaliseContext();
      fixture.detectChanges();
      expect(el('.et-context-note').textContent).toContain('email-templates-context-converted');
      component.onContextChange(component.contextText + ' ');
      fixture.detectChanges();
      expect(el('.et-context-note')).toBeNull();
      flush();
    }));
  });

  describe('usability round presentation', () => {
    const helpers = ['each', 'if', 'join', 'log', 'customHook'];
    const withHelpers = (overrides: Partial<EmailAdminEditorState> = {}) =>
      editorState({ ...overrides, help: { ...editorState().help, helpers } });
    const texts = (root: Element, selector: string): string[] =>
      Array.from(root.querySelectorAll(selector)).map(node => node.textContent!.trim());

    function openPublishWith(format: 'html' | 'text', liveFormat: 'html' | 'text'): HTMLElement {
      start(
        editorState({
          live: { ...editorState().live!, format: liveFormat },
          draft: draft(7, {
            body: '<p>Line one</p>\n<p>Line two</p>',
            subject: 'Ready for review: {{record.metadata.title}}',
            format,
          }),
        })
      );
      component.openPublish();
      tick();
      fixture.detectChanges();
      return el('dialog[open]');
    }

    it('UR-U01 adds a Format row and a to-text warning only when the format changes', fakeAsync(() => {
      const dialog = openPublishWith('text', 'html');
      const format = dialog.querySelector('.et-summary-format') as HTMLElement;
      expect(format).toBeTruthy();
      expect(format.previousElementSibling!.textContent).toContain('email-templates-format-label');
      expect(format.querySelector('span')!.textContent).toBe('email-templates-format-html');
      expect(format.querySelector('strong')!.textContent).toBe('email-templates-format-text');
      expect(dialog.querySelector('.et-format-warning')!.textContent).toContain(
        'email-templates-publish-format-to-text-warning'
      );
      expect(dialog.textContent).toContain('email-templates-publish-body-unchanged');
      component.closeDialog();
      flush();
    }));

    it('UR-U01 warns about HTML interpretation when switching from plain text', fakeAsync(() => {
      const dialog = openPublishWith('html', 'text');
      expect(dialog.querySelector('.et-summary-format strong')!.textContent).toBe('email-templates-format-html');
      expect(dialog.querySelector('.et-format-warning')!.textContent).toContain(
        'email-templates-publish-format-to-html-warning'
      );
      component.closeDialog();
      flush();
    }));

    it('UR-U01 omits the Format row and warning when the format is unchanged', fakeAsync(() => {
      const dialog = openPublishWith('html', 'html');
      expect(dialog.querySelector('.et-summary-format')).toBeNull();
      expect(dialog.querySelector('.et-format-warning')).toBeNull();
      expect(dialog.textContent).not.toContain('email-templates-format-label');
      component.closeDialog();
      flush();
    }));

    function validateWith(body: string, diagnostics: any[]): HTMLElement {
      start(editorState({ draft: draft(7, { body }) }));
      api['validate'].and.resolveTo(diagnostics);
      typeBody(body);
      tick(VALIDATE_DEBOUNCE_MS);
      fixture.detectChanges();
      return el('#et-body-diagnostics');
    }

    it('UR-U02 explains an unclosed allow-listed block with its tags as code and moves to its opening', fakeAsync(() => {
      const body = '<p>Creators</p>\n  {{#each record.metadata.creators}}\n<p>{{this.name}}</p>';
      const list = validateWith(body, [
        {
          code: 'INVALID_TEMPLATE',
          severity: 'error',
          field: 'body',
          reason: 'UNCLOSED_BLOCK',
          helper: 'each',
          line: 2,
          column: 3,
        },
      ]);
      const text = list.querySelector('.et-diagnostic-text')!;
      expect(text.textContent).toContain('email-templates-diagnostic-UNCLOSED_BLOCK-helper');
      expect(texts(text, 'code')).toEqual(['{{#each}}', '{{/each}}']);
      expect(list.textContent).toContain('email-templates-diagnostic-position line=2 column=3');
      (list.querySelector('.et-diagnostic') as HTMLButtonElement).click();
      expect(document.activeElement).toBe(bodyArea());
      expect(bodyArea().selectionStart).toBe(body.indexOf('{{#each'));
      flush();
    }));

    it('UR-U02 uses generic wording for custom blocks and specific wording for other syntax reasons', fakeAsync(() => {
      const list = validateWith('{{#custom x}}\n{{/if}}\n{{ oops', [
        { code: 'INVALID_TEMPLATE', severity: 'error', field: 'body', reason: 'UNCLOSED_BLOCK', line: 1, column: 1 },
        {
          code: 'INVALID_TEMPLATE',
          severity: 'error',
          field: 'body',
          reason: 'MISMATCHED_CLOSE',
          helper: 'with',
          line: 2,
          column: 1,
        },
        { code: 'INVALID_TEMPLATE', severity: 'error', field: 'body', reason: 'MISMATCHED_CLOSE', line: 2, column: 1 },
        { code: 'INVALID_TEMPLATE', severity: 'error', field: 'body', reason: 'UNEXPECTED_TOKEN', line: 3, column: 4 },
        {
          code: 'INVALID_TEMPLATE',
          severity: 'error',
          field: 'body',
          reason: 'UNCLOSED_BLOCK',
          helper: 'partial',
          line: 1,
          column: 1,
        },
      ]);
      const messages = texts(list, '.et-diagnostic-text');
      expect(messages[0]).toBe('email-templates-diagnostic-UNCLOSED_BLOCK');
      expect(messages[1]).toContain('email-templates-diagnostic-MISMATCHED_CLOSE-helper');
      expect(texts(list.querySelectorAll('.et-diagnostic-text')[1], 'code')).toEqual(['{{#with}}', '{{/with}}']);
      expect(messages[2]).toBe('email-templates-diagnostic-MISMATCHED_CLOSE');
      expect(messages[3]).toBe('email-templates-diagnostic-UNEXPECTED_TOKEN');
      // A name outside the fixed allow-list is never echoed.
      expect(messages[4]).toBe('email-templates-diagnostic-UNCLOSED_BLOCK');
      expect(list.textContent).not.toContain('INVALID_SYNTAX');
      flush();
    }));

    function failRender(body: string, line: number, column: number): void {
      start(editorState({ draft: draft(7, { body }) }));
      renderFails(line, column);
    }

    function renderFails(line: number, column: number): void {
      api['preview'].and.rejectWith(
        new EmailTemplateApiError(400, 'RENDER_FAILED', [
          { code: 'RENDER_FAILED', severity: 'error', field: 'body', reason: 'RENDER_FAILED', line, column },
        ])
      );
      component.onContextChange('{"record": {"metadata": {}}}');
      tick(PREVIEW_DEBOUNCE_MS);
      fixture.detectChanges();
    }

    it('UR-U02 names the failing path from local source and navigates to it', fakeAsync(() => {
      const body = '<p>Lead</p>\n<p>{{record.metadata.contributor_ci.name}}</p>';
      failRender(body, 2, 6);
      const error = el('.et-preview-error');
      expect(error.textContent).toContain('email-templates-preview-render-failed');
      const row = error.querySelector('button.et-preview-diagnostic') as HTMLButtonElement;
      expect(row.textContent).toContain('email-templates-body-label');
      expect(row.textContent).toContain('email-templates-diagnostic-position line=2 column=6');
      expect(row.textContent).toContain('email-templates-diagnostic-RENDER_FAILED-named');
      expect(texts(row, 'code')).toEqual(['record.metadata.contributor_ci.name']);
      row.click();
      expect(document.activeElement).toBe(bodyArea());
      expect(bodyArea().selectionStart).toBe(body.indexOf('record.metadata.contributor_ci'));
      flush();
    }));

    for (const body of [
      'ﬁ {{record.metadata.missing}}',
      'ﬁ ﬃ ﬄ\nﬃ ﬁ\nﬁ ﬄ {{record.metadata.missing}}',
      'e\u0301 {{record.metadata.missing}}',
    ]) {
      it('uses original Unicode buffer coordinates for render-path recovery and navigation', fakeAsync(() => {
        const lines = body.split('\n');
        failRender(body, lines.length, lines.at(-1)!.indexOf('record.metadata.missing') + 1);
        const row = el('button.et-preview-diagnostic') as HTMLButtonElement;
        expect(texts(row, 'code')).toEqual(['record.metadata.missing']);
        row.click();
        expect(document.activeElement).toBe(bodyArea());
        expect(bodyArea().selectionStart).toBe(body.indexOf('record.metadata.missing'));
        flush();
      }));
    }

    it('UR-U02 keeps the generic render message when no expression is at the position', fakeAsync(() => {
      failRender('<p>No expressions</p>', 1, 2);
      const row = el('.et-preview-diagnostic');
      expect(row.textContent).toContain('email-templates-diagnostic-RENDER_FAILED');
      expect(row.textContent).not.toContain('RENDER_FAILED-named');
      expect(row.querySelector('code')).toBeNull();
      flush();
    }));

    it('UR-U02 relabels the left success state while the preview is failing', fakeAsync(() => {
      start(editorState({ draft: draft(7, { body: '<p>{{record.metadata.missing}}</p>' }) }));
      expect(el('.et-ok').textContent).toContain('email-templates-no-problems');
      renderFails(1, 6);
      expect(el('.et-ok').textContent).toContain('email-templates-no-syntax-policy-errors');
      api['preview'].and.resolveTo({
        subject: 'Ok',
        html: '<p>Ok</p>',
        frameUrl: '/frame',
        sanitiserRemovals: [],
        diagnostics: [],
      });
      component.onContextChange('{"record": {"metadata": {"missing": "x"}}}');
      tick(PREVIEW_DEBOUNCE_MS);
      fixture.detectChanges();
      expect(el('.et-ok').textContent).toContain('email-templates-no-problems');
      flush();
    }));

    it('UR-U02 does not navigate the editor for diagnostics in the supplied default preview', fakeAsync(() => {
      failRender('<p>{{record.metadata.x}}</p>', 1, 6);
      component.previewSource = 'default';
      fixture.detectChanges();
      expect(el('button.et-preview-diagnostic')).toBeNull();
      expect(el('span.et-preview-diagnostic')).toBeTruthy();
      flush();
    }));

    it('UR-U03 shows block helpers with syntax and example, and inline helper usage on hover or focus', fakeAsync(() => {
      start(withHelpers());
      const rows = Array.from(fixture.nativeElement.querySelectorAll('.et-helper-row')) as HTMLElement[];
      expect(rows.map(row => row.querySelector('button')!.textContent!.trim())).toEqual(['#each', '#if']);
      expect(rows[0].querySelector('.et-helper-syntax')!.textContent).toBe('email-templates-helper-each-syntax');
      expect(rows[0].querySelector('code.et-helper-example')!.textContent).toBe('email-templates-helper-each-example');
      expect(rows[0].querySelector('button')!.getAttribute('aria-describedby')).toBe('et-helper-usage-each');

      const chips = Array.from(fixture.nativeElement.querySelectorAll('.et-chips .et-chip')) as HTMLButtonElement[];
      expect(chips.map(chip => chip.textContent!.trim())).toEqual(['join', 'log', 'customHook']);
      expect(el('.et-helper-card').textContent).toContain('email-templates-help-helper-hint');
      chips[0].dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      expect(el('.et-helper-card .et-helper-syntax').textContent).toBe('email-templates-helper-join-syntax');
      expect(el('.et-helper-card code').textContent).toBe('email-templates-helper-join-example');
      expect(chips[0].getAttribute('aria-describedby')).toBe('et-helper-usage-join');
      expect(el('#et-helper-usage-join').textContent).toContain('email-templates-helper-join-syntax');
      // Hook helpers without documentation still insert, with no broken description.
      chips[2].dispatchEvent(new Event('mouseenter'));
      fixture.detectChanges();
      expect(chips[2].getAttribute('aria-describedby')).toBeNull();
      expect(el('.et-helper-card').textContent).toContain('email-templates-help-helper-hint');
      flush();
    }));

    it('UR-U03 inserts a block scaffold with its placeholder selected, and inline helpers as before', fakeAsync(() => {
      start(withHelpers());
      bodyArea().setSelectionRange(0, 0);
      (el('.et-helper-row button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const area = bodyArea();
      expect(
        component.content.body.startsWith('{{#each record.metadata.YOUR_ARRAY}}\n  {{this}}\n{{/each}}')
      ).toBeTrue();
      expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('YOUR_ARRAY');
      expect(document.activeElement).toBe(area);

      area.setSelectionRange(area.value.length, area.value.length);
      (fixture.nativeElement.querySelector('.et-chips .et-chip') as HTMLButtonElement).click();
      expect(component.content.body.endsWith('{{join }}')).toBeTrue();
      expect(area.selectionStart).toBe(area.value.length);
      flush();
    }));

    it('UR-U03 explains that a form-config field list may be incomplete', fakeAsync(() => {
      start();
      expect(el('.et-help-precision')).toBeNull();
      component.contextSchema = {
        recordType: 'rdmp',
        stage: 'draft',
        precision: 'form-config',
        schema: contextSchemaFixture(),
      } as any;
      fixture.detectChanges();
      expect(el('.et-help-precision').textContent).toContain('email-templates-help-form-config-incomplete');
      component.contextSchema = { ...component.contextSchema!, precision: 'record-schema' } as any;
      fixture.detectChanges();
      expect(el('.et-help-precision')).toBeNull();
      flush();
    }));

    it('UR-U04 labels Context JSON as temporary, explains imports.record and names the template draft', fakeAsync(() => {
      start(editorState({ draft: draft(7) }));
      expect(el('#et-context-scope').textContent).toContain('email-templates-context-temporary');
      const imports = el('#et-context-imports');
      expect(imports.textContent).toContain('email-templates-context-imports-note');
      expect(texts(imports, 'code')).toEqual(['imports.record', 'record']);
      expect(el('#et-context').getAttribute('aria-describedby')).toBe(
        'et-context-scope et-context-help et-context-imports'
      );
      expect(el('.et-footer-status').textContent).toContain('email-templates-status-template-saved');
      flush();
    }));
  });
});
