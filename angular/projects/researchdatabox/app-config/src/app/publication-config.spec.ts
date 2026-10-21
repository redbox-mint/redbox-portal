import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { By } from '@angular/platform-browser';
import {
  AppConfigService,
  ConfigService,
  LoggerService,
  TranslationService,
  UtilityService,
} from '@researchdatabox/portal-ng-common';
import { AppConfigModule } from './app-config.module';
import { AppConfigComponent } from './app-config.component';
import { FigshareCrosswalkApiService } from './services/figshare-crosswalk-api.service';
import { PublicationDestinationsTypeComponent } from './fieldTypes/publication-destinations/publication-destinations.type';
import { PublicationJsonTypeComponent } from './fieldTypes/publication-destinations/publication-json.type';
import { getStubConfigService, getStubTranslationService } from '../../../portal-ng-common/src/lib/helper.spec';

// Representative server schema: provider widget annotations and secrets are supplied by the registry.
const providers = [
  {
    id: 'figshare',
    executionAvailable: true,
    capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: false },
    secretPaths: ['connection.token'],
    schema: {
      type: 'object',
      properties: {
        connection: { type: 'object', properties: { baseUrl: { type: 'string' }, token: { type: 'string' } } },
        mapping: {
          type: 'object',
          properties: {
            title: {
              type: 'object',
              widget: { formlyConfig: { type: 'value-binding-editor', props: { allowCrosswalk: true } } },
              properties: {
                kind: { type: 'string', default: 'path' },
                path: { type: 'string' },
                crosswalkId: { type: 'string' },
                sourceVocabularyId: { type: 'string' },
                outputs: { type: 'string', default: 'categoryId' },
                source: {
                  type: 'object',
                  properties: { kind: { type: 'string', default: 'path' }, path: { type: 'string' } },
                },
              },
            },
          },
        },
        attachments: { type: 'object' },
        providerOptions: { type: 'object' },
      },
    },
  },
  {
    id: 'oni',
    executionAvailable: false,
    capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: true },
    secretPaths: ['connection.ingestion.adminToken'],
    schema: {
      type: 'object',
      properties: {
        connection: {
          type: 'object',
          properties: {
            ingestion: { type: 'object', properties: { enabled: { type: 'boolean' }, adminToken: { type: 'string' } } },
          },
        },
        mapping: { type: 'object' },
        attachments: { type: 'object' },
        providerOptions: { type: 'object' },
      },
    },
  },
];
interface Destination {
  provider: string;
  displayName: string;
  enabled: boolean;
  archived: boolean;
  connection: Record<string, unknown>;
  mapping: Record<string, unknown>;
  attachments: Record<string, unknown>;
  providerOptions: Record<string, unknown>;
  writeBack: Record<string, unknown>;
}
const destination = (provider: string, name: string): Destination => ({
  provider,
  displayName: name,
  enabled: false,
  archived: false,
  connection:
    provider === 'figshare'
      ? { baseUrl: 'https://api.figshare.com/v2', token: '__REDACTED__' }
      : { ingestion: { enabled: false, adminToken: '__REDACTED__' } },
  mapping: {},
  attachments: {},
  providerOptions: {},
  writeBack: {},
});

interface Model {
  destinations: Record<string, ReturnType<typeof destination>>;
  sourcePolicies: object[];
  workflow: { rules: object[] };
}

describe('Publication AppConfig editor (PUB-14)', () => {
  let fixture: ComponentFixture<AppConfigComponent>;
  let stored: Model;
  let providerDefinitions: object[];
  let saves: number;
  let rejectSave: boolean;
  let rejectReload: boolean;
  beforeEach(async () => {
    saves = 0;
    rejectSave = false;
    rejectReload = false;
    providerDefinitions = structuredClone(providers);
    stored = {
      sourcePolicies: [],
      workflow: { rules: [] },
      destinations: {
        'figshare-main': destination('figshare', 'Institutional Figshare'),
        'figshare-second': destination('figshare', 'Faculty Figshare'),
        'oni-main': destination('oni', 'Research repository'),
      },
    };
    await TestBed.configureTestingModule({
      imports: [AppConfigModule],
      providers: [
        provideZonelessChangeDetection(),
        LoggerService,
        UtilityService,
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: TranslationService, useValue: getStubTranslationService() },
        {
          provide: FigshareCrosswalkApiService,
          useValue: {
            waitForInit: async () => {},
            getCrosswalkAdminUrl: () => '/figshare-crosswalk',
            listAllLocalVocabularies: async () => [],
            listAllApprovedCrosswalks: async () => [],
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            waitForInit: async () => {},
            getAppConfigForm: async () => {
              if (rejectReload) throw new Error('reload failed');
              return {
                model: structuredClone(stored),
                fieldOrder: ['destinations', 'sourcePolicies', 'workflow'],
                schema: {
                  type: 'object',
                  required: ['destinations', 'sourcePolicies', 'workflow'],
                  properties: {
                    destinations: {
                      type: 'object',
                      widget: {
                        formlyConfig: { type: 'publication-destinations', props: { providers: providerDefinitions } },
                      },
                    },
                    sourcePolicies: { type: 'array', items: { type: 'object' } },
                    workflow: {
                      type: 'object',
                      required: ['rules'],
                      properties: { rules: { type: 'array', items: { type: 'object' } } },
                    },
                  },
                },
              };
            },
            saveAppConfig: async (_key: string, model: Model) => {
              if (rejectSave) throw new Error('private provider error containing credentials');
              saves++;
              stored = structuredClone(model);
              for (const value of Object.values(stored.destinations))
                if (value.provider === 'figshare')
                  value.connection = { baseUrl: 'https://api.figshare.com/v2', token: '__REDACTED__' };
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppConfigComponent);
    fixture.componentInstance.configKey = 'publicationPublishing';
    fixture.autoDetectChanges();
    await fixture.componentInstance.waitForInit();
    await fixture.whenStable();
  });
  const element = <T extends Element>(fixture: ComponentFixture<AppConfigComponent>, selector: string): T => {
    const found: T | null = (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
    if (!found) throw new Error(`Missing element ${selector}`);
    return found;
  };
  const editor = () =>
    fixture.debugElement.query(By.directive(PublicationDestinationsTypeComponent))
      .componentInstance as PublicationDestinationsTypeComponent;

  it('saves disabled destinations with empty policy and workflow lists', async () => {
    expect(fixture.componentInstance.form.valid).toBeTrue();
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    expect(saves).toBe(1);
    expect(stored.sourcePolicies).toEqual([]);
    expect(stored.workflow.rules).toEqual([]);
  });

  it('renders two same-provider destinations independently and keeps registered credentials in password inputs', () => {
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-destination-id]').length).toBe(3);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type=password]').length).toBe(3);
    expect(element<HTMLInputElement>(fixture, '[data-destination-id="figshare-main"] input[type=password]').value).toBe(
      '__REDACTED__'
    );
    expect(
      element<HTMLInputElement>(
        fixture,
        '[data-destination-id="figshare-main"] input:not([type=checkbox]):not([type=password]):not([disabled])'
      ).value
    ).toBe('Institutional Figshare');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('@publication-config-provider-unavailable');
  });
  it('rejects duplicate and unsafe IDs but permits a third destination with the same provider, disabled by default', async () => {
    editor().newId = 'figshare-main';
    editor().addDestination();
    expect(editor().addError).toBe('@publication-config-id-duplicate');
    editor().newId = '__proto__';
    editor().addDestination();
    expect(editor().addError).toBe('@publication-config-id-invalid');
    editor().newId = 'figshare-third';
    editor().newProvider = 'figshare';
    editor().addDestination();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.componentInstance.model as Model).destinations['figshare-third'].enabled).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-destination-id]').length).toBe(4);
  });
  it('saves edits by destination ID and reloads the masked server model', async () => {
    const input = element<HTMLInputElement>(fixture, '[data-destination-id="figshare-main"] input[type=password]');
    input.value = 'replacement-secret';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(saves).toBe(1);
    expect(element<HTMLInputElement>(fixture, '[data-destination-id="figshare-main"] input[type=password]').value).toBe(
      '__REDACTED__'
    );
    expect(JSON.stringify(fixture.componentInstance.model)).not.toContain('replacement-secret');
  });
  it('blocks invalid JSON and shows actionable errors without exposing provider exception text', async () => {
    const json = fixture.debugElement.query(By.directive(PublicationJsonTypeComponent))
      .componentInstance as PublicationJsonTypeComponent;
    json.update('{bad json');
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    expect(saves).toBe(0);
    expect(fixture.componentInstance.formSaveError).toBe('@app-config-validation-error');
    json.update('{}');
    rejectSave = true;
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.formSaveError).toBe('@publication-config-save-error');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('private provider error');
  });
  it('keeps invalid JSON invalid when Formly revalidates the existing control', async () => {
    const json = fixture.debugElement.query(By.directive(PublicationJsonTypeComponent))
      .componentInstance as PublicationJsonTypeComponent;
    json.update('{bad json');
    json.formControl.updateValueAndValidity();
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    expect(saves).toBe(0);
    expect(json.formControl.hasError('publicationJson')).toBeTrue();
    json.update('{}');
    json.formControl.updateValueAndValidity();
    expect(json.formControl.hasError('publicationJson')).toBeFalse();
  });
  it('does not create optional empty bindings on load, and retains configured crosswalk IDs', async () => {
    const before = fixture.componentInstance.model as Model;
    expect(before.destinations['figshare-main'].mapping['title']).toBeUndefined();
    const binding = {
      kind: 'crosswalk',
      source: { kind: 'path', path: 'metadata.forCodes' },
      sourceVocabularyId: 'for-vocab',
      crosswalkId: 'approved-for',
      outputs: 'categoryId',
    };
    stored.destinations['figshare-main'].mapping = { title: binding };
    await fixture.componentInstance['initComponent']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.componentInstance.model as Model).destinations['figshare-main'].mapping['title']).toEqual(binding);
    expect((fixture.nativeElement as HTMLElement).querySelector('formly-value-binding-editor-type')).toBeTruthy();
  });
  it('keeps an unknown provider and its settings visible for repair without discarding saved values', async () => {
    stored.destinations['unknown-target'] = {
      ...destination('unknown-provider', 'Missing provider'),
      mapping: { importantReference: 'keep-me' },
    };
    await fixture.componentInstance['initComponent']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('@publication-config-provider-unknown');
    expect((fixture.componentInstance.model as Model).destinations['unknown-target'].mapping).toEqual({
      importantReference: 'keep-me',
    });
  });
  it('renders registered wildcard credentials as password controls rather than a JSON credential editor', async () => {
    const translate = spyOn(TestBed.inject(TranslationService), 't').and.callThrough();
    providerDefinitions.push({
      id: 'hook-provider',
      executionAvailable: true,
      capabilities: { synchronise: false, observe: true, reconcile: true, resourceLeases: false },
      secretPaths: ['connection.accounts.*.apiKey'],
      schema: {
        type: 'object',
        properties: {
          connection: {
            type: 'object',
            properties: {
              accounts: {
                type: 'object',
                additionalProperties: { type: 'object', properties: { apiKey: { type: 'string' } } },
              },
            },
          },
          attachments: { type: 'object' },
        },
      },
    });
    stored.destinations['hook-main'] = {
      ...destination('hook-provider', 'Hook'),
      connection: { accounts: { research: { apiKey: '__REDACTED__' } } },
    };
    await fixture.componentInstance['initComponent']();
    fixture.detectChanges();
    await fixture.whenStable();
    const root = element<HTMLElement>(fixture, '[data-destination-id="hook-main"]');
    expect(root.querySelectorAll('input[type=password]').length).toBe(1);
    expect(translate.calls.allArgs().some(args => args[0] === '@publication-config-secret-help')).toBeTrue();
    expect(root.querySelector('formly-publication-map textarea')).toBeNull();
    expect(root.textContent).not.toContain('Attachments');
  });

  it('masks replacement credentials even when the save succeeds but the server reload fails', async () => {
    const input = element<HTMLInputElement>(fixture, '[data-destination-id="figshare-main"] input[type=password]');
    input.value = 'replacement-secret';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    rejectReload = true;
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(saves).toBe(1);
    expect(fixture.componentInstance.formSaveError).toBe('@publication-config-reload-error');
    expect(input.value).toBe('__REDACTED__');
    expect(JSON.stringify(fixture.componentInstance.model)).not.toContain('replacement-secret');
  });
});
