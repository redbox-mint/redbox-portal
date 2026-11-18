import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import english from '../../../../../../language-defaults/en/translation.json';
import { TranslationService } from 'projects/researchdatabox/portal-ng-common/src/lib/translation.service';
import { AdminAiProfilesComponent } from './admin-ai-profiles.component';
import { ProfileApiService, ProfileApiError } from './profile-api.service';
import { clone } from './profile-settings';
import { overview, version } from './test-fixtures';
describe('Drafting profile editor', () => {
  let fixture: ComponentFixture<AdminAiProfilesComponent>, component: AdminAiProfilesComponent, api: jasmine.SpyObj<ProfileApiService>, original: string;
  const changes = new Subject<void>();
  const t = (key: string, options?: Record<string, unknown>) => ((english as Record<string,string>)[key] || key || '').replace(/{{(\w+)}}/g, (_, k) => String(options?.[k] ?? ''));
  beforeEach(async () => {
    original = location.pathname + location.search + location.hash; history.replaceState(null, '', location.pathname);
    api = jasmine.createSpyObj('api', ['waitForInit','overview','create','save','publish','version','retire','duplicate','discard','remove','tests']);
    api.brandingAndPortalUrl = '/brand/portal'; api.waitForInit.and.resolveTo(api); api.overview.and.callFake(async () => clone(overview));
    api.save.and.callFake(async (_id, body) => ({ ...clone(version), definition: body.definition, contentHash: 'saved-hash' })); api.publish.and.resolveTo({ ...clone(version), status: 'published' });
    api.version.and.resolveTo({ ...clone(version), id: 'v2', version: 2 }); api.remove.and.resolveTo({ deleted: true, uses: [], hasPublished: false, runCount: 0 }); api.discard.and.resolveTo({ deleted: true, uses: [], hasPublished: false, runCount: 0 });
    api.tests.and.resolveTo([{ name: 'Synthetic example', passed: true, ranAt: '2026-11-18T00:00:00Z', fields: [{ label: 'Summary', value: '<script>untrusted</script>', evidence: ['Activity title'], passed: true }] }]);
    await TestBed.configureTestingModule({ imports: [AdminAiProfilesComponent], providers: [{ provide: TranslationService, useValue: { t, waitForInit: async () => undefined, isInitializing: () => false, translationChanges$: changes } }] }).overrideComponent(AdminAiProfilesComponent, { set: { providers: [{ provide: ProfileApiService, useValue: api }] } }).compileComponents();
    fixture = TestBed.createComponent(AdminAiProfilesComponent); component = fixture.componentInstance; fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); history.replaceState(null, '', original); });
  const query = (s: string): HTMLElement => fixture.nativeElement.querySelector(s);
  const open = () => { component.open('profile'); fixture.detectChanges(); };
  it('uses hash state and one header without an Angular router', () => { open(); expect(location.hash).toContain('profile=profile'); expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1); expect(api.overview).toHaveBeenCalledTimes(1); });
  it('shows labelled source and target fields without metadata paths', () => { open(); expect(query('#profile-source').textContent).toContain('Activity title'); expect(query('#profile-fields').textContent).toContain('Summary'); expect(fixture.nativeElement.textContent).not.toContain('/summary'); });
  it('saves incomplete drafts but blocks publishing with linked problems', async () => { open(); component.draft!.targetFields = []; fixture.detectChanges(); expect(component.canPublish).toBeFalse(); expect(query('#profile-problems a')).toBeTruthy(); await component.saveDraft(); expect(api.save).toHaveBeenCalled(); await component.publish(); expect(api.publish).not.toHaveBeenCalled(); });
  it('saves before publishing and passes the saved concurrency hash', async () => { open(); component.draft!.purpose = 'Changed'; await component.publish(); expect(api.save).toHaveBeenCalled(); expect(api.publish).toHaveBeenCalledWith('v1', 'saved-hash'); });
  it('keeps local edits on conflict and requires an explicit resolution', async () => { open(); component.name = 'Local'; api.save.and.rejectWith(new ProfileApiError(409, 'ai-profiles-error-generation-target-conflict')); await component.saveDraft(); expect(component.conflict).toBeTrue(); expect(component.name).toBe('Local'); await component.reloadConflict(); component.resolveConflict(true); expect(component.conflict).toBeFalse(); expect(component.name).toBe('Local'); });
  it('guards hash navigation and leaving a dirty page', () => { open(); component.name = 'Changed'; spyOn(window, 'confirm').and.returnValue(false); component.open(); expect(component.draft).toBeDefined(); const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent; component.beforeUnload(e); expect(e.defaultPrevented).toBeTrue(); });
  it('asks only once when leaving through an external page link', () => {
    open(); component.name = 'Changed'; spyOn(window, 'confirm').and.returnValue(true);
    const anchor = document.createElement('a'); anchor.href = '/brand/portal/admin/ai-models';
    const click = new MouseEvent('click', { cancelable: true }); Object.defineProperty(click, 'target', { value: anchor });
    component.guardLink(click); expect(window.confirm).toHaveBeenCalledTimes(1);
    const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(unload); expect(unload.defaultPrevented).toBeFalse();
  });
  it('edits direct question text and adds all six answer types', async () => { open(); for (const type of component.questionTypes) { component.editQuestion(); component.question!.label = 'Question ' + type; component.question!.type = type; component.questionTypeChanged(); component.addQuestionOption(); component.question!.options!.at(-1)!.label = 'First'; component.addQuestionOption(); component.question!.options!.at(-1)!.label = 'Second'; await component.submitModal(); } expect(component.draft!.questions.length).toBe(7); expect(component.draft!.questions.at(-1)!.options![0].label).toBe('First'); expect(component.draft!.questions.at(-1)!.labelKey).toBeUndefined(); });
  it('keeps stored choice values and test answers when option labels or help change', async () => {
    open(); component.draft!.questions[0] = { id: 'methods', label: 'Which methods?', type: 'multiEnum', required: true, sourceDefaultExpression: '/title', options: [{ value: 'one', label: 'Interviews' }, { value: 'two', labelKey: 'ai-profiles-yes' }] };
    component.draft!.fixtureTests = [{ name: 'Saved example', source: {}, answers: { methods: ['one'] } }];
    component.editQuestion(0); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const input = query('#profile-question-option-0') as HTMLInputElement;
    expect(input.value).toBe('Interviews'); expect(query('.modal').textContent).not.toContain('value:');
    input.value = 'Structured interviews'; input.dispatchEvent(new Event('input')); await fixture.whenStable();
    component.question!.helpText = 'Include planned work';
    component.addQuestionOption(); component.question!.options![2].label = 'Observation';
    const newValue = component.question!.options![2].value;
    await component.submitModal();
    expect(component.draft!.questions[0].options).toEqual([{ value: 'one', label: 'Structured interviews' }, { value: 'two', label: 'Yes' }, { value: newValue, label: 'Observation' }]);
    expect(component.draft!.questions[0].sourceDefaultExpression).toBe('/title');
    expect(component.tests[0].answers['methods']).toEqual(['one']);
    component.editQuestion(0); component.question!.helpText = 'Another wording edit'; await component.submitModal();
    expect(component.draft!.questions[0].options![2].value).toBe(newValue);
  });
  it('clears only test answers using a removed choice and tells the administrator', async () => {
    open(); component.draft!.questions[0] = { id: 'methods', label: 'Which methods?', type: 'multiEnum', required: false, options: [{ value: 'one', label: 'Interviews' }, { value: 'two', label: 'Surveys' }] };
    component.draft!.fixtureTests = [
      { name: 'Multiple', source: {}, answers: { methods: ['one', 'two'], other: 'Keep' } },
      { name: 'Single', source: {}, answers: { methods: 'one' } },
      { name: 'Unchanged', source: {}, answers: { methods: ['two'] } },
    ];
    component.editQuestion(0); component.removeQuestionOption(0); await component.submitModal(); fixture.detectChanges();
    expect(component.tests.map(t => t.answers['methods'])).toEqual([null, null, ['two']]);
    expect(component.tests[0].answers['other']).toBe('Keep');
    expect(component.draft!.questions[0].options).toEqual([{ value: 'two', label: 'Surveys' }]);
    expect(query('[role="status"]').textContent).toContain('Which methods? were cleared in 2 test cases');
  });
  for (const type of ['enum', 'multiEnum'] as const) it(`copies source choices and excludes free-text prefill for ${type} questions`, async () => {
    open();
    const options = [{ value: 'interviews', label: 'Interviews' }, { value: 'surveys', label: 'Surveys' }];
    component.sourceForm!.fields.push({ pointer: '/methods', label: 'Research methods', group: 'Activity', component: 'CheckboxInputComponent', output: { kind: 'enumArray', values: options.map(o => o.value) }, options });
    component.toggleSource('/methods', true);
    component.editQuestion(); component.question!.label = 'Which methods?'; component.question!.type = type; component.questionTypeChanged();
    component.addQuestionOption(); component.question!.options![0].label = 'Old choice';
    fixture.detectChanges(); await fixture.whenStable();
    const select = query('#profile-question-prefill') as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.text)).toEqual(['No pre-fill', 'Research methods']);
    select.value = '/methods'; select.dispatchEvent(new Event('change')); await fixture.whenStable(); fixture.detectChanges();
    expect(component.question!.options).toEqual(options);
    expect(query('.modal').textContent).toContain('The choices now come from Research methods.');
    await component.submitModal(); await component.saveDraft();
    const saved = api.save.calls.mostRecent().args[1].definition.questions.at(-1)!;
    expect(saved.options).toEqual(options); expect(saved.sourceDefaultExpression).toBe('/methods');
    component.editQuestion(component.draft!.questions.length - 1); component.question!.options![0].label = 'Structured interviews'; await component.submitModal();
    expect(component.draft!.questions.at(-1)!.options![0].value).toBe('interviews');
    expect(options[0].label).toBe('Interviews');
    component.editQuestion(); component.question!.label = 'Title?'; component.question!.sourceDefaultExpression = '/title';
    fixture.detectChanges(); await fixture.whenStable();
    expect(Array.from((query('#profile-question-prefill') as HTMLSelectElement).options).map(o => o.value)).toContain('/title');
    component.question!.type = type; component.questionTypeChanged(); expect(component.question!.sourceDefaultExpression).toBeUndefined();
  });
  it('saves target choice meanings and removes them when a text field is picked', async () => {
    open(); const options = [{ value: '1', label: 'Approved' }, { value: '2', label: 'Not required' }];
    component.targetForm!.fields.push({ pointer: '/ethics', label: 'Ethics approval', group: 'Plan', component: 'DropdownInputComponent', output: { kind: 'enum', values: ['1', '2'] }, options });
    component.editField(); component.pickField('/ethics'); await component.submitModal(); await component.saveDraft();
    expect(api.save.calls.mostRecent().args[1].definition.targetFields[1].options).toEqual(options);
    expect(component.draft!.targetFields[1].output).toEqual({ kind: 'enum', values: ['1', '2'] });
    component.draft!.targetFields.splice(0, 1); component.editField(0); component.pickField('/summary');
    expect(component.field!.options).toBeUndefined(); expect(options[0].label).toBe('Approved');
  });
  it('omits cleared question and field character limits from the saved draft and retains the form limit', async () => {
    open(); component.editQuestion(0); component.question!.maxLength = 50;
    fixture.detectChanges(); await fixture.whenStable();
    const questionLimit = query('#profile-question-length') as HTMLInputElement;
    questionLimit.value = ''; questionLimit.dispatchEvent(new Event('input')); await fixture.whenStable();
    expect(component.question!.maxLength).toBeNull(); expect(component.modalValid).toBeTrue(); await component.submitModal();
    component.editField(0); component.field!.maxLength = 50; fixture.detectChanges(); await fixture.whenStable();
    const fieldLimit = query('#profile-field-length') as HTMLInputElement;
    fieldLimit.value = ''; fieldLimit.dispatchEvent(new Event('input')); await fixture.whenStable();
    expect(component.field!.maxLength).toBeNull(); expect(component.modalValid).toBeTrue(); await component.submitModal();
    await component.saveDraft(); const saved = api.save.calls.mostRecent().args[1].definition;
    expect(Object.hasOwn(saved.questions[0], 'maxLength')).toBeFalse();
    expect(Object.hasOwn(saved.targetFields[0], 'maxLength')).toBeFalse();
    expect(saved.targetFields[0].output).toEqual({ kind: 'string', maxLength: 200 });
    expect(component.canPublish).toBeTrue();
  });

  it('reorders questions with buttons and removes stale answer references', () => { open(); spyOn(window, 'confirm').and.returnValue(true); component.draft!.targetFields[0].reviewedAnswerIds = ['question']; component.remove(component.draft!.questions, 0); expect(component.draft!.targetFields[0].reviewedAnswerIds).toEqual([]); });
  it('derives field output and always marks a fallback for review', () => { open(); component.editField(0); component.pickField('/summary'); component.setFallback('Review this'); expect(component.field!.output).toEqual({ kind: 'string', maxLength: 200 }); expect(component.field!.fallback!.reviewRequired).toBeTrue(); });
  it('prevents duplicate field choices and explains a profile name that is already used', () => {
    open(); component.editField(); expect(component.targetChoices).toEqual([]);
    component.askCreate(); component.modal!.name = 'Research plan'; fixture.detectChanges();
    expect(component.nameUsed).toBeTrue(); expect(component.modalValid).toBeFalse(); expect(query('.modal').textContent).toContain('already uses this name');
  });
  it('blocks deletion and lists linked form actions', () => { const p = component.overview!.profiles[0]; p.hasPublished = true; p.uses = [{ key: 'action', name: 'Create plan', href: '/record/plan/edit' }]; component.askDelete(p); fixture.detectChanges(); expect(query('.modal a').getAttribute('href')).toBe('/brand/portal/record/plan/edit'); expect((query('.rb-admin-danger-confirm') as HTMLButtonElement).disabled).toBeTrue(); });
  it('only deletes after the dialog confirmation and discards through the version endpoint', async () => { component.askDelete(component.overview!.profiles[0]); expect(api.remove).not.toHaveBeenCalled(); await component.confirmAction(); expect(api.remove).toHaveBeenCalledWith('profile'); open(); component.askDiscard(); await component.confirmAction(); expect(api.discard).toHaveBeenCalledWith('v1'); });
  it('renders published content as a summary, with no disabled editor controls or save bar', () => { component.overview!.profiles[0].versions[0].status = 'published'; open(); expect(query('#profile-about dl')).toBeTruthy(); expect(query('#profile-about input')).toBeNull(); expect(query('.rb-admin-save-bar')).toBeNull(); });
  it('runs real API tests after saving and renders values as text', async () => { open(); await component.runTests(); fixture.detectChanges(); expect(api.tests).toHaveBeenCalledWith('v1'); expect(query('.profile-test-result').textContent).toContain('<script>untrusted</script>'); expect(query('.profile-test-result script')).toBeNull(); });
  it('invalidates test results when the profile changes', async () => { open(); await component.runTests(); component.changed(); expect(component.results).toEqual([]); });

  it('starts with a neutral linked checklist and shows danger only after a publish attempt', async () => {
    open(); component.draft!.purpose = ''; fixture.detectChanges();
    expect(query('#profile-problems').classList).toContain('alert-info');
    expect(query('#profile-problems a').getAttribute('href')).toContain('section=about');
    (query('.rb-admin-page-actions .btn-primary') as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(query('#profile-problems').classList).toContain('alert-danger');
    expect(api.publish).not.toHaveBeenCalled();
  });
  it('reports a saved valid draft without claiming problems', async () => {
    open(); await component.saveDraft(); fixture.detectChanges();
    expect(query('[role="status"]').textContent).toBe('Draft saved.');
    component.draft!.targetFields = []; await component.saveDraft(); fixture.detectChanges();
    expect(query('[role="status"]').textContent).toContain('1 problem to fix before publishing');
  });
  it('keeps the live profile open after discarding a later draft and names the version', async () => {
    const p = component.overview!.profiles[0];
    const live = { ...clone(version), status: 'published' as const };
    const draft = { ...clone(version), id: 'v2', version: 2 };
    p.versions = [draft, live]; p.publishedVersionId = live.id; p.hasPublished = true;
    component.open('profile', 2); component.askDiscard();
    api.overview.and.resolveTo({ ...clone(overview), profiles: [{ ...p, versions: [live] }] });
    await component.confirmAction(); fixture.detectChanges();
    expect(component.selected?.id).toBe('v1'); expect(component.readOnly).toBeTrue();
    expect(location.hash).toContain('profile=profile');
    expect(query('[role="status"]').textContent).toContain('Draft v2 discarded.');
  });
  it('keeps model and guidance open and labels add and edit dialogs', () => {
    open(); expect(query('#profile-model').tagName).toBe('SECTION'); expect(query('#profile-guidance').tagName).toBe('SECTION');
    for (const [edit, label] of [[() => component.editQuestion(), 'Add question'], [() => component.editQuestion(0), 'Edit question'], [() => component.editField(), 'Add field'], [() => component.editField(0), 'Edit field'], [() => component.editCase(), 'Add test case'], [() => component.editCase(0), 'Edit test case']] as const) {
      edit(); fixture.detectChanges(); expect(query('.modal-title').textContent).toBe(label);
    }
  });
  it('hides retired profiles by default while preserving search and drafts of retired profiles', () => {
    const p = component.overview!.profiles[0]; p.hasPublished = true; p.versions[0].status = 'retired';
    expect(component.visibleProfiles).toEqual([]); expect(component.retiredCount).toBe(1);
    component.showRetired = true; expect(component.visibleProfiles.length).toBe(1);
    component.search = 'missing'; expect(component.visibleProfiles).toEqual([]);
    component.search = ''; component.showRetired = false; p.versions.unshift({ ...clone(version), id: 'v2', version: 2 });
    expect(component.visibleProfiles.length).toBe(1);
  });
  it('allows a document-only profile to publish and still requires at least one source', async () => {
    open(); component.draft!.sourceSlots = [];
    component.draft!.documentSources = { formats: ['txt'], maxFiles: 1, maxFileBytes: 1024, maxTextBytes: 1024 };
    expect(component.canPublish).toBeTrue();
    delete component.draft!.documentSources;
    expect(component.canPublish).toBeFalse();
  });

});
