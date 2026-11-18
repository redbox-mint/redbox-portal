import { GENERATION_QUESTION_OPTION_LIMIT } from '@researchdatabox/sails-ng-common';
import { Component, ElementRef, HostListener, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { I18NextPipe } from 'projects/researchdatabox/portal-ng-common/src/lib/i18next.pipe';
import { TranslationService } from 'projects/researchdatabox/portal-ng-common/src/lib/translation.service';
import { AdminDatePipe } from 'projects/researchdatabox/portal-ng-common/src/lib/admin-date.pipe';
import { AdminModalDirective } from 'projects/researchdatabox/portal-ng-common/src/lib/admin-modal.directive';
import type { GenerationProfileDefinition, ProfileOverview, ProfileSummary, ProfileVersion, ProfileProblem, ProfileField, ProfileTestResult } from '@researchdatabox/sails-ng-common';
import { ProfileApiService, ProfileApiError } from './profile-api.service';
import { ProfileValueComponent } from './profile-value.component';
import { clone, questionTypes, origins, profileProblems } from './profile-settings';
type Question = GenerationProfileDefinition['questions'][number];
type Field = GenerationProfileDefinition['targetFields'][number];
type TestCase = { name: string; source: Record<string, any>; answers: Record<string, any> };
type Modal = { kind: 'create' | 'duplicate' | 'question' | 'field' | 'case' | 'delete' | 'discard' | 'retire'; name: string; key?: string; index?: number };
@Component({ selector: 'admin-ai-profiles', standalone: true,
  imports: [CommonModule, FormsModule, A11yModule, I18NextPipe, AdminDatePipe, AdminModalDirective, ProfileValueComponent], providers: [ProfileApiService],
  templateUrl: './admin-ai-profiles.component.html', encapsulation: ViewEncapsulation.None })
export class AdminAiProfilesComponent implements OnInit, OnDestroy {
  readonly questionOptionLimit = GENERATION_QUESTION_OPTION_LIMIT;
  overview?: ProfileOverview;
  profile?: ProfileSummary;
  selected?: ProfileVersion;
  draft?: GenerationProfileDefinition;
  name = '';
  saved = '';
  error = '';
  notice = '';
  noticeParams: Record<string, unknown> = {};
  publishAttempted = false;
  showRetired = false;
  loading = true;
  busy = false;
  running = false;
  testError = '';
  conflict = false;
  remote?: ProfileVersion;
  modal?: Modal;
  question?: Question;
  field?: Field;
  testCase?: TestCase;
  topicsText = '';
  sourceType = '';
  formName = '';
  activeSection = 'about';
  results: ProfileTestResult[] = [];
  cooldown = 0;
  search = '';
  private timer?: ReturnType<typeof setInterval>;
  private acceptedHash = '';
  private leave = false;
  private disposed = false;
  private frame = 0;
  readonly questionTypes = questionTypes;
  readonly origins = origins;
  readonly sections = ['about', 'model', 'source', 'questions', 'guidance', 'fields', 'tests', 'versions'];
  constructor(public api: ProfileApiService, public i18n: TranslationService, private host: ElementRef<HTMLElement>) {}
  async ngOnInit(): Promise<void> {
    try { await Promise.all([this.api.waitForInit(), this.i18n.waitForInit()]); await this.refresh(); this.applyHash(); }
    catch (e) { this.handle(e); } finally { this.loading = false; }
  }
  ngOnDestroy(): void { this.disposed = true; if (this.timer) clearInterval(this.timer); cancelAnimationFrame(this.frame); }
  get base(): string { return this.api.brandingAndPortalUrl; }
  versionKey(version: ProfileVersion): string { return version.status === 'published' ? version.id === this.profile?.publishedVersionId ? 'ai-profiles-version-live' : 'ai-profiles-version-history' : 'ai-profiles-version-' + version.status; }
  get hasDraft(): boolean { return !!this.profile?.versions.some(v => v.status === 'draft'); }
  hasProblem(row: string): boolean { return this.problems.some(p => p.row === row); }
  get fieldMaxLength(): number | null { const output = this.fieldChoice?.output; return output && 'maxLength' in output ? output.maxLength ?? null : null; }
  get readOnly(): boolean { return this.selected?.status !== 'draft'; }
  get json(): string { return JSON.stringify({ name: this.name, definition: this.draft }); }
  get dirty(): boolean { return !!this.draft && this.json !== this.saved; }
  get problems(): ProfileProblem[] {
    return this.draft && this.overview ? [...profileProblems(this.draft, this.overview), ...(!this.dirty ? this.selected?.problems ?? [] : [])]
      .filter((p, i, all) => all.findIndex(q => q.section === p.section && q.row === p.row && q.messageKey === p.messageKey) === i) : [];
  }
  get canPublish(): boolean { return !!this.name.trim() && !this.readOnly && !this.problems.length && !this.conflict; }
  get source() { return this.draft?.sourceSlots[0]; }
  get sourceForm() { return this.overview?.forms.find(f => f.name === this.overview?.recordTypes.find(t => t.name === this.source?.recordType)?.formName); }
  get sourceFields(): ProfileField[] { return this.sourceForm?.fields ?? []; }
  get selectedSourceFields(): ProfileField[] { return this.sourceFields.filter(f => this.source?.allowedPaths.includes(f.pointer)); }
  get oversizedQuestionPrefillFields(): ProfileField[] { return this.questionIsChoice ? this.selectedSourceFields.filter(f => (f.options?.length ?? 0) > this.questionOptionLimit) : []; }
  get questionPrefillFields(): ProfileField[] { return this.selectedSourceFields.filter(f => !this.questionIsChoice || !!f.options?.length && f.options.length <= this.questionOptionLimit); }
  get questionIsChoice(): boolean { return !!this.question && ['enum', 'multiEnum'].includes(this.question.type); }
  get sourceGroups(): string[] { return [...new Set(this.sourceFields.map(f => f.group))]; }
  get targetForm() { return this.overview?.forms.find(f => f.name === this.draft?.targetForm?.formName); }
  get targetChoices(): ProfileField[] { return this.targetForm?.fields.filter(f => !!f.output && (!this.draft?.targetFields.some(target => target.metadataPointer === f.pointer) || f.pointer === this.field?.metadataPointer)) ?? []; }
  get model() { return this.overview?.models.find(m => m.id === this.draft?.modelDeploymentId); }
  get tests(): TestCase[] { return (this.draft?.fixtureTests ?? []) as TestCase[]; }
  isRetired(p: ProfileSummary): boolean { return p.hasPublished && !p.versions.some(v => v.status === 'draft' || v.status === 'published' && v.id === p.publishedVersionId); }
  get retiredCount(): number { return this.overview?.profiles.filter(p => this.isRetired(p)).length ?? 0; }
  get visibleProfiles(): ProfileSummary[] { return this.overview?.profiles.filter(p => (this.showRetired || !this.isRetired(p)) && (p.name + ' ' + p.versions[0]?.definition.purpose).toLowerCase().includes(this.search.toLowerCase())) ?? []; }
  get deletionProfile(): ProfileSummary | undefined { return this.overview?.profiles.find(p => p.key === this.modal?.key); }
  get deleteBlocked(): boolean { const p = this.deletionProfile; return !!p && (p.hasPublished || p.uses.length > 0 || p.runCount > 0); }
  get liveVersion() { return this.deletionProfile?.versions.find(v => v.id === this.deletionProfile?.publishedVersionId && v.status === 'published'); }
  get nameUsed(): boolean { return !!this.modal?.name.trim() && !!this.overview?.profiles.some(p => p.name.toLowerCase() === this.modal?.name.trim().toLowerCase()); }
  get modalValid(): boolean {
    if (!this.modal) return false;
    if (this.modal.kind === 'question') return !!this.question?.label?.trim() && (!['enum', 'multiEnum'].includes(this.question.type) || !!this.question.options?.length && this.question.options.length <= this.questionOptionLimit && this.question.options.every(o => !!o.label?.trim())) && (this.question.maxLength == null || Number.isInteger(this.question.maxLength) && this.question.maxLength > 0);
    if (this.modal.kind === 'field') return !!this.field?.metadataPointer && !!this.field.expectedComponentClasses.length && (this.field.maxLength == null || Number.isInteger(this.field.maxLength) && this.field.maxLength > 0);
    if (this.modal.kind === 'case') return !!this.testCase?.name.trim();
    return !!this.modal.name.trim() && !this.nameUsed;
  }
  async refresh(): Promise<void> { this.overview = await this.api.overview(); }
  async retry(): Promise<void> { this.loading = true; this.error = ''; await this.ngOnInit(); }
  private handle(e: unknown): void { this.error = e instanceof ProfileApiError ? e.messageKey : 'ai-profiles-error-generation-provider-unavailable'; if (e instanceof ProfileApiError && e.status === 409) this.conflict = true; }
  text(value?: string, key?: string): string { return value || (key ? this.i18n.t(key) : ''); }
  fieldLabel(field: Field): string { return this.targetForm?.fields.find(f => f.pointer === field.metadataPointer)?.label || field.label || this.i18n.t('ai-profiles-unnamed-field'); }
  sourceLabel(pointer?: string): string { return this.sourceFields.find(f => f.pointer === pointer)?.label || this.i18n.t('ai-profiles-no-prefill'); }
  formLabel(name?: string): string { return this.overview?.forms.find(f => f.name === name)?.label || this.i18n.t('ai-profiles-unavailable-form'); }
  typeLabel(name?: string): string { return this.overview?.recordTypes.find(t => t.name === name)?.label || this.i18n.t('ai-profiles-unavailable-source'); }
  modelLabel(id?: string): string { const m = this.overview?.models.find(m => m.id === id); return m ? m.name + ' · v' + m.version : this.i18n.t('ai-profiles-unavailable-model'); }
  state(profile: ProfileSummary): string {
    const live = profile.versions.find(v => v.id === profile.publishedVersionId && v.status === 'published');
    const draft = profile.versions.find(v => v.status === 'draft');
    return [live ? this.i18n.t('ai-profiles-live', { version: live.version }) : profile.hasPublished ? this.i18n.t('ai-profiles-retired') : this.i18n.t('ai-profiles-not-live'), ...(draft ? [this.i18n.t('ai-profiles-draft', { version: draft.version })] : [])].join(' · ');
  }
  href(key?: string, version?: number, section?: string): string {
    const params = new URLSearchParams(); if (key) params.set('profile', key); if (version) params.set('version', String(version)); if (section) params.set('section', section);
    return location.pathname + location.search + (params.size ? '#' + params : '');
  }
  private guard(): boolean { return !this.busy && !this.running && (!this.dirty || confirm(this.i18n.t('ai-profiles-discard-confirm'))); }
  open(key?: string, version?: number): void { if (!this.guard()) return; history.pushState(null, '', this.href(key, version)); this.applyHash(); requestAnimationFrame(() => this.host.nativeElement.querySelector<HTMLElement>('h1')?.focus()); }
  private applyHash(): void {
    const state = new URLSearchParams(location.hash.slice(1)); this.acceptedHash = location.hash;
    this.profile = this.overview?.profiles.find(p => p.key === state.get('profile'));
    this.selected = this.profile?.versions.find(v => state.has('version') ? String(v.version) === state.get('version') : true);
    this.draft = this.selected ? clone(this.selected.definition) : undefined; this.name = this.profile?.name ?? ''; this.saved = this.json;
    this.error = state.has('profile') && !this.selected ? 'ai-profiles-error-generation-action-not-available' : ''; this.notice = ''; this.noticeParams = {}; this.publishAttempted = false; this.conflict = false; this.remote = undefined; this.modal = undefined; this.results = [];
    this.activeSection = state.get('section') || 'about'; if (state.has('section')) requestAnimationFrame(() => this.section(this.activeSection, false));
  }
  @HostListener('window:hashchange') hashChange(): void {
    if (location.hash === this.acceptedHash) return;
    const next = new URLSearchParams(location.hash.slice(1)), old = new URLSearchParams(this.acceptedHash.slice(1));
    if (['profile', 'version'].every(k => old.get(k) === next.get(k))) { this.acceptedHash = location.hash; this.section(next.get('section') || 'about', false); return; }
    if (!this.guard()) { history.replaceState(null, '', location.pathname + location.search + this.acceptedHash); return; } this.applyHash();
  }
  section(id: string, update = true): void {
    this.activeSection = id; this.host.nativeElement.querySelector<HTMLElement>('#profile-' + id)?.scrollIntoView({ block: 'start' });
    if (update) { history.replaceState(null, '', this.href(this.profile?.key, this.selected?.version, id)); this.acceptedHash = location.hash; }
  }
  @HostListener('window:scroll') scroll(): void {
    if (this.frame) return; this.frame = requestAnimationFrame(() => { this.frame = 0; this.activeSection = this.sections.filter(id => (this.host.nativeElement.querySelector('#profile-' + id)?.getBoundingClientRect().top ?? Infinity) < 160).at(-1) || 'about'; });
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void { if ((this.dirty || this.busy || this.running) && !this.leave) { event.preventDefault(); event.returnValue = ''; } }
  @HostListener('document:click', ['$event']) guardLink(event: MouseEvent): void {
    if (!this.dirty || this.leave || event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const a = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement;
    if (!a || a.target === '_blank' || a.hasAttribute('download') || new URL(a.href).pathname === location.pathname) return;
    if (!this.guard()) event.preventDefault(); else this.leave = true;
  }
  changed(): void { this.results = []; this.testError = ''; this.notice = ''; }
  toggleSource(pointer: string, on: boolean): void { if (!this.source) return; this.source.allowedPaths = on ? [...this.source.allowedPaths, pointer] : this.source.allowedPaths.filter(p => p !== pointer); this.changed(); }
  changeSource(): void { if (this.source) this.source.allowedPaths = []; this.changed(); }
  changeTarget(name: string): void { const form = this.overview?.forms.find(f => f.name === name); if (this.draft && form) this.draft.targetForm = { recordType: form.recordType, formName: form.name }; this.changed(); }
  toggleDocuments(on: boolean): void { if (!this.draft || !this.overview) return; if (on) this.draft.documentSources = { ...clone(this.overview.limits.documents), maxFiles: Math.min(3, this.overview.limits.documents.maxFiles) }; else delete this.draft.documentSources; this.changed(); }
  toggleFormat(format: 'pdf' | 'docx' | 'txt', on: boolean): void { const d = this.draft?.documentSources; if (d) d.formats = on ? [...d.formats, format] : d.formats.filter(f => f !== format); this.changed(); }
  toggleGuidance(id: string, on: boolean): void { if (!this.draft) return; this.draft.knowledgeCollectionVersionIds = on ? [...this.draft.knowledgeCollectionVersionIds, id] : this.draft.knowledgeCollectionVersionIds.filter(g => g !== id); this.changed(); }
  move(items: any[], index: number, direction: number): void { if (index + direction < 0 || index + direction >= items.length) return; [items[index], items[index + direction]] = [items[index + direction], items[index]]; this.changed(); }
  remove(items: any[], index: number): void {
    if (!confirm(this.i18n.t('ai-profiles-remove-confirm'))) return;
    if (items === this.draft?.questions) {
      const id = items[index].id;
      for (const f of this.draft.targetFields) f.reviewedAnswerIds = f.reviewedAnswerIds?.filter(q => q !== id);
      for (const test of this.tests) delete test.answers[id];
    }
    items.splice(index, 1); this.changed();
  }
  private id(prefix: string): string { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  askCreate(): void { if (!this.guard()) return; this.sourceType = this.overview?.recordTypes.find(t => t.formName)?.name || ''; this.formName = this.overview?.forms[0]?.name || ''; this.modal = { kind: 'create', name: '' }; }
  askDuplicate(p: ProfileSummary): void { if (!this.guard()) return; this.closeMenus(); this.modal = { kind: 'duplicate', name: this.i18n.t('ai-profiles-copy-name', { name: p.name }), key: p.key }; }
  editQuestion(index?: number): void {
    this.question = index === undefined ? { id: this.id('question'), label: '', helpText: '', type: 'text', required: false, maxLength: 2000 } : clone(this.draft!.questions[index]);
    this.question.label = this.text(this.question.label, this.question.labelKey); this.question.helpText = this.text(this.question.helpText, this.question.helpTextKey);
    this.question.options = this.question.options?.map(o => ({ value: o.value, label: this.text(o.label, o.labelKey) }));
    this.modal = { kind: 'question', name: '', index };
  }
  addQuestionOption(): void { if (this.question && (this.question.options?.length ?? 0) < this.questionOptionLimit) (this.question.options ??= []).push({ value: this.id('option'), label: '' }); }
  removeQuestionOption(index: number): void { this.question?.options?.splice(index, 1); }
  questionTypeChanged(): void {
    if (!this.question) return;
    if (!['text', 'textarea'].includes(this.question.type)) delete this.question.maxLength; else this.question.maxLength ??= 2000;
    if (this.question.sourceDefaultExpression && !this.questionPrefillFields.some(f => f.pointer === this.question!.sourceDefaultExpression)) delete this.question.sourceDefaultExpression;
    if (this.questionIsChoice && this.question.sourceDefaultExpression) this.pickQuestionPrefill(this.question.sourceDefaultExpression);
  }
  pickQuestionPrefill(pointer: string): void {
    if (!this.question) return;
    const source = this.questionPrefillFields.find(f => f.pointer === pointer);
    if (!source) { delete this.question.sourceDefaultExpression; return; }
    this.question.sourceDefaultExpression = pointer;
    if (this.questionIsChoice) this.question.options = clone(source.options!);
  }
  editField(index?: number): void {
    this.field = index === undefined ? { id: this.id('field'), metadataPointer: '', expectedComponentClasses: [], output: { kind: 'string' }, operation: 'fill', grounding: 'sourceRequired', reviewedAnswerIds: this.draft!.questions.map(q => q.id) } : clone(this.draft!.targetFields[index]);
    this.topicsText = this.field.knowledgeTags?.join(', ') ?? ''; this.modal = { kind: 'field', name: '', index };
  }
  pickField(pointer: string): void {
    const chosen = this.targetChoices.find(f => f.pointer === pointer);
    if (!this.field || !chosen?.output) return;
    this.field.metadataPointer = pointer; this.field.label = chosen.label; this.field.expectedComponentClasses = [chosen.component]; this.field.output = clone(chosen.output);
    if (chosen.options?.length) this.field.options = clone(chosen.options); else delete this.field.options;
    this.field.reviewedAnswerIds = this.draft!.questions.map(q => q.id);
    if ('maxLength' in chosen.output) this.field.maxLength = chosen.output.maxLength; else delete this.field.maxLength;
    delete this.field.fallback;
  }
  get fieldChoice(): ProfileField | undefined { return this.targetChoices.find(f => f.pointer === this.field?.metadataPointer); }
  get fieldText(): boolean { return ['string', 'richText'].includes(this.field?.output.kind ?? ''); }
  valueType(output?: { kind: string }): string { return output?.kind === 'enumArray' ? 'multiEnum' : output?.kind === 'boolean' || output?.kind === 'date' || output?.kind === 'enum' ? output.kind : 'textarea'; }
  setFallback(value: unknown): void { if (!this.field) return; if (value === '' || value === null || Array.isArray(value) && !value.length) delete this.field.fallback; else this.field.fallback = { value, reasonCode: 'ADMIN_FALLBACK_REQUIRES_REVIEW', reviewRequired: true }; }
  editCase(index?: number): void { this.testCase = index === undefined ? { name: '', source: {}, answers: {} } : clone(this.tests[index]); this.modal = { kind: 'case', name: '', index }; }
  async submitModal(): Promise<void> {
    if (!this.modal || this.busy || !this.modalValid) return;
    const m = this.modal;
    this.changed();
    if (m.kind === 'question' && this.question) {
      const q = clone(this.question); delete q.labelKey; delete q.helpTextKey;
      if (q.maxLength == null) delete q.maxLength;
      q.options = ['enum', 'multiEnum'].includes(q.type) ? q.options?.map(o => ({ value: o.value, label: o.label!.trim() })) : undefined;
      if (m.index !== undefined && q.options) {
        const removed = this.draft!.questions[m.index].options?.filter(o => !q.options!.some(option => option.value === o.value)) ?? [];
        let cleared = 0;
        for (const test of this.tests) {
          const answer = test.answers[q.id];
          if (removed.some(o => Array.isArray(answer) ? answer.includes(o.value) : answer === o.value)) {
            test.answers[q.id] = null; cleared++;
          }
        }
        if (cleared) { this.notice = 'ai-profiles-option-answers-cleared'; this.noticeParams = { label: q.label, count: cleared }; }
      }
      if (!q.sourceDefaultExpression) delete q.sourceDefaultExpression;
      this.replace(this.draft!.questions, m.index, q);
      if (m.index === undefined) for (const f of this.draft!.targetFields) f.reviewedAnswerIds = [...(f.reviewedAnswerIds ?? []), q.id];
    } else if (m.kind === 'field' && this.field) {
      if (this.field.maxLength == null) delete this.field.maxLength;
      this.field.knowledgeTags = this.topicsText.split(',').map(t => t.trim()).filter(Boolean);
      this.replace(this.draft!.targetFields, m.index, clone(this.field));
    } else if (m.kind === 'case' && this.testCase) this.replace(this.draft!.fixtureTests ??= [], m.index, clone(this.testCase));
    else {
      this.busy = true; this.error = '';
      try {
        const p = m.kind === 'create' ? await this.api.create({ name: m.name.trim(), sourceRecordType: this.sourceType, targetFormName: this.formName }) : await this.api.duplicate(m.key!, m.name.trim());
        await this.refresh(); this.saved = this.json; this.busy = false; this.open(p.key); this.modal = undefined;
      } catch (e) { this.handle(e); } finally { this.busy = false; } return;
    }
    this.modal = undefined;
  }
  private replace<T>(items: T[], index: number | undefined, value: T): void { if (index === undefined) items.push(value); else items[index] = value; }
  async saveDraft(): Promise<boolean> {
    if (!this.draft || !this.selected || this.busy || this.readOnly || this.conflict || !this.name.trim()) return false;
    this.busy = true; this.error = '';
    try {
      const saved = await this.api.save(this.selected.id, { name: this.name.trim(), definition: clone(this.draft), expectedContentHash: this.selected.contentHash });
      this.selected = saved; this.draft = clone(saved.definition); this.name = this.name.trim(); this.saved = this.json;
      await this.refresh(); this.profile = this.overview!.profiles.find(p => p.key === this.profile?.key); this.notice = this.problems.length ? (this.problems.length === 1 ? 'ai-profiles-draft-saved-problem' : 'ai-profiles-draft-saved-problems') : 'ai-profiles-draft-saved'; this.noticeParams = { count: this.problems.length }; return true;
    } catch (e) { this.handle(e); return false; } finally { this.busy = false; }
  }
  async publish(): Promise<void> {
    if (this.busy || this.running) return;
    this.publishAttempted = true;
    if (!this.canPublish) { this.host.nativeElement.querySelector<HTMLElement>('#profile-problems')?.focus(); return; }
    if (!await this.saveDraft()) return;
    this.busy = true;
    try { await this.api.publish(this.selected!.id, this.selected!.contentHash); await this.refresh(); this.applyHash(); this.notice = 'ai-profiles-published-notice-named'; this.noticeParams = { name: this.name, version: this.selected?.version }; }
    catch (e) { this.handle(e); await this.refresh(); this.selected = this.overview?.profiles.find(p => p.key === this.profile?.key)?.versions.find(v => v.id === this.selected?.id) || this.selected; }
    finally { this.busy = false; }
  }
  async newVersion(): Promise<void> {
    if (!this.selected || !this.guard()) return; this.busy = true;
    try { const v = await this.api.version(this.selected.id); await this.refresh(); history.pushState(null, '', this.href(this.profile!.key, v.version)); this.applyHash(); }
    catch (e) { this.handle(e); } finally { this.busy = false; }
  }
  discardChanges(): void { if (!this.guard()) return; const saved = JSON.parse(this.saved); this.name = saved.name; this.draft = saved.definition; this.changed(); }
  private closeMenus(): void { this.host.nativeElement.querySelectorAll('details.profile-more[open]').forEach(e => e.removeAttribute('open')); }
  askDelete(p: ProfileSummary): void { this.closeMenus(); this.modal = { kind: 'delete', key: p.key, name: p.name }; }
  askDiscard(): void { this.modal = { kind: 'discard', key: this.profile!.key, name: this.profile!.name }; }
  askRetire(v = this.selected): void { if (v) this.modal = { kind: 'retire', name: this.overview?.profiles.find(p => p.versions.some(version => version.id === v.id))?.name || this.name, key: v.id }; }
  async confirmAction(): Promise<void> {
    const m = this.modal; if (!m || this.busy) return;
    const keepEditor = m.kind === 'retire' && !!this.selected && m.key !== this.selected.id;
    if ((m.kind === 'delete' || m.kind === 'retire' && !keepEditor) && !this.guard()) return;
    const version = m.kind === 'retire' ? this.overview?.profiles.flatMap(p => p.versions).find(v => v.id === m.key)?.version : this.selected?.version;
    this.busy = true; this.error = '';
    try {
      if (m.kind === 'retire') await this.api.retire(m.key!);
      else {
        const result = m.kind === 'discard' ? await this.api.discard(this.selected!.id) : await this.api.remove(m.key!);
        if (!result.deleted) { await this.refresh(); this.modal = { ...m, kind: 'delete' }; return; }
      }
      this.modal = undefined; await this.refresh();
      if (keepEditor) {
        // Refresh lifecycle information without replacing local edits or their concurrency hash.
        this.profile = this.overview?.profiles.find(p => p.key === this.profile?.key) || this.profile;
      } else {
        const remaining = m.kind === 'discard' ? this.overview?.profiles.find(p => p.key === m.key) : undefined;
        const live = remaining?.versions.find(v => v.id === remaining.publishedVersionId) || remaining?.versions[0];
        history.replaceState(null, '', this.href(remaining?.key, live?.version)); this.applyHash();
      }
      this.notice = m.kind === 'retire' ? 'ai-profiles-retired-notice-named' : m.kind === 'discard' ? 'ai-profiles-draft-discarded-version' : 'ai-profiles-profile-deleted';
      this.noticeParams = { name: m.name, version };
    } catch (e) { this.handle(e); } finally { this.busy = false; }
  }
  async reloadConflict(): Promise<void> { this.busy = true; try { await this.refresh(); this.remote = this.overview?.profiles.find(p => p.key === this.profile?.key)?.versions.find(v => v.id === this.selected?.id); } catch (e) { this.handle(e); } finally { this.busy = false; } }
  resolveConflict(keep: boolean): void { if (!this.remote || keep && this.remote.status !== 'draft') return; if (keep) { this.selected = clone(this.remote); this.saved = JSON.stringify({ name: this.profile?.name, definition: this.remote.definition }); } else this.applyHash(); this.remote = undefined; this.conflict = false; this.error = ''; }
  async runTests(): Promise<void> {
    if (this.running || this.busy || this.cooldown || !this.tests.length || this.problems.length) { this.section('tests'); return; }
    if (!this.readOnly && !await this.saveDraft()) return;
    this.running = true; this.testError = ''; this.error = ''; this.section('tests');
    const until = Date.now() + 5000; const tick = () => { this.cooldown = Math.max(0, Math.ceil((until - Date.now()) / 1000)); if (!this.cooldown && this.timer) clearInterval(this.timer); }; tick(); this.timer = setInterval(tick, 250);
    try { const results = await this.api.tests(this.selected!.id); if (!this.disposed) this.results = results; } catch (e) { this.handle(e); this.testError = this.error; } finally { this.running = false; }
  }
  display(value: unknown): string { return value === true ? this.i18n.t('ai-profiles-yes') : value === false ? this.i18n.t('ai-profiles-no') : Array.isArray(value) ? value.join(', ') : String(value ?? ''); }
}
