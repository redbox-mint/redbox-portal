import { Provider } from '@angular/core';
import { Subject } from 'rxjs';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import type { EmailAdminCatalogueEntry, EmailAdminEditorState, EmailAdminHistory } from './email-templates.model';
import { EmailTemplateAdminService } from './email-template-admin.service';

/** Returns the key plus any non-option params, so specs can assert on both. */
export class TranslationStub {
  translationChanges$ = new Subject<void>();
  t(key: string, options?: Record<string, unknown>): string {
    if (!options) {
      return key;
    }
    const params = Object.entries(options)
      .filter(([name]) => name !== 'interpolation')
      .map(([name, value]) => `${name}=${value}`);
    return params.length ? `${key} ${params.join(' ')}` : key;
  }
  isInitializing(): boolean {
    return false;
  }
  getCurrentLanguage(): string {
    return 'en';
  }
  async waitForInit(): Promise<this> {
    return this;
  }
}

export class LoggerStub {
  debug(): void {}
  info(): void {}
  error(): void {}
}

export type ServiceStub = { [K in keyof EmailTemplateAdminService]?: jasmine.Spy };

export function serviceStub(): Record<string, jasmine.Spy | unknown> & Record<string, any> {
  const stub: Record<string, any> = {
    brandName: 'default',
    waitForInit: jasmine.createSpy('waitForInit').and.callFake(async () => stub),
    isInitializing: () => false,
    catalogue: jasmine.createSpy('catalogue').and.resolveTo([]),
    editorState: jasmine.createSpy('editorState').and.callFake(async () => editorState()),
    saveDraft: jasmine.createSpy('saveDraft'),
    discardDraft: jasmine.createSpy('discardDraft').and.resolveTo({ discarded: true }),
    draftFromDefault: jasmine.createSpy('draftFromDefault'),
    validate: jasmine.createSpy('validate').and.resolveTo([]),
    preview: jasmine.createSpy('preview').and.resolveTo({
      subject: 'Rendered subject',
      html: '<p>Rendered</p>',
      sanitiserRemovals: [],
      diagnostics: [],
    }),
    searchRecords: jasmine.createSpy('searchRecords').and.resolveTo({ records: [], page: 1, hasMore: false }),
    recordContext: jasmine
      .createSpy('recordContext')
      .and.resolveTo({ oid: 'rec-1', record: { metadata: { title: 'Soil carbon survey' } } }),
    publish: jasmine.createSpy('publish'),
    reset: jasmine.createSpy('reset'),
    history: jasmine.createSpy('history').and.resolveTo([]),
    historyVersion: jasmine.createSpy('historyVersion'),
    restore: jasmine.createSpy('restore'),
  };
  return stub;
}

export function commonProviders(stub: unknown): Provider[] {
  return [
    { provide: TranslationService, useClass: TranslationStub },
    { provide: LoggerService, useClass: LoggerStub },
    { provide: EmailTemplateAdminService, useValue: stub },
  ];
}

export function editorState(overrides: Partial<EmailAdminEditorState> = {}): EmailAdminEditorState {
  return {
    templateId: 'publicationReview',
    suppliedDefault: { subject: 'Publication ready for review', body: '<p>Default body</p>', format: 'html' },
    live: {
      subject: 'Ready for review: {{record.metadata.title}}',
      body: '<p>Line one</p>\n<p>Line two</p>',
      format: 'html',
      token: { id: 'live-1', revision: 4 },
      defaultHash: 'hash',
      updatedBy: 'u1',
      updatedByName: 'Jo Smith',
      updatedAt: '2026-10-27T03:32:00.000Z',
    },
    draft: null,
    defaultUpdated: false,
    invalid: false,
    diagnostics: [],
    consistency: [],
    help: {
      contextRoots: ['oid', 'portal', 'record'],
      helpers: ['each', 'formatDate', 'if'],
      maxSubjectBytes: 998,
      maxBodyBytes: 1048576,
      maxContextBytes: 262144,
    },
    latestVersion: 4,
    historyMaxVersions: 50,
    ...overrides,
  };
}

export function catalogueEntry(overrides: Partial<EmailAdminCatalogueEntry> = {}): EmailAdminCatalogueEntry {
  return {
    templateId: 'publicationReview',
    description: 'Publication ready for review',
    source: 'override',
    liveVersion: 4,
    latestVersion: 4,
    hasDraft: false,
    draftRevision: null,
    invalid: false,
    defaultUpdated: false,
    consistency: [],
    updatedBy: 'u1',
    updatedByName: 'Jo Smith',
    updatedAt: '2026-10-27T03:32:00.000Z',
    ...overrides,
  };
}

export function historyEntry(overrides: Partial<EmailAdminHistory> = {}): EmailAdminHistory {
  return {
    version: 1,
    event: 'publish',
    subject: 'Old subject',
    body: '<p>Old body</p>',
    format: 'html',
    restoredFromVersion: null,
    defaultHash: 'hash',
    actorId: 'u1',
    actorDisplayName: 'Jo Smith',
    createdAt: '2026-10-02T23:30:00.000Z',
    live: false,
    applied: true,
    ...overrides,
  };
}
