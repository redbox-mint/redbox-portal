import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { AUTOSAVE_DEBOUNCE_MS, EditorComponent, PREVIEW_DEBOUNCE_MS, VALIDATE_DEBOUNCE_MS } from './editor.component';
import { EmailAdminDraft, EmailAdminEditorState, EmailTemplateApiError } from './email-templates.model';
import { commonProviders, editorState, historyEntry, serviceStub } from './email-templates.testing';

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
    fixture.detectChanges();
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
});
