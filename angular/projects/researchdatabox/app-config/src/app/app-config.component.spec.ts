import { Pipe, PipeTransform, provideZonelessChangeDetection } from '@angular/core';
import { FormlyFieldWrapperComponent } from '@researchdatabox/portal-ng-common';
import { AdminSaveShortcutComponent } from '@researchdatabox/portal-ng-common';
import { OniPublishing, ONI_PUBLISHING_SCHEMA } from '../../../../../../packages/redbox-core/src/configmodels/OniPublishing';
import { RaidPublishing, RAID_PUBLISHING_SCHEMA } from '../../../../../../packages/redbox-core/src/configmodels/RaidPublishing';
import { INTEGRATION_NOTIFICATION_SCHEMA } from '../../../../../../packages/redbox-core/src/configmodels/IntegrationNotificationConfig';
import { By } from '@angular/platform-browser';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { configSchemaToField } from './dictionary-schema';
import { sectionSummary } from './config-form';
import { DictionaryTypeComponent } from './fieldTypes/dictionary.type';
import { JsonTypeComponent } from './fieldTypes/json.type';
import { NavigationRowComponent } from './fieldTypes/navigation-editor/navigation-row.component';
import { NavigationFieldsComponent } from './fieldTypes/navigation-editor/navigation-fields.component';
import { NavigationLinkDialogComponent } from './fieldTypes/navigation-editor/navigation-link-dialog.component';

import { A11yModule } from '@angular/cdk/a11y';
import { SectionTypeComponent } from './fieldTypes/section.type';
import { SecretTypeComponent } from './fieldTypes/secret.type';
import { ChipsTypeComponent } from './fieldTypes/chips.type';

@Pipe({ name: 'i18next', standalone: false })
class MockI18NextPipe implements PipeTransform {
  transform(value: string, options?: any): string { return value; }
}
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { AppConfigComponent } from './app-config.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService, AppConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from '../../../portal-ng-common/src/lib/helper.spec';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { ArrayTypeComponent } from './fieldTypes/array.type';
import { ObjectTypeComponent } from './fieldTypes/object.type';
import { FormlyFieldTextArea } from '@ngx-formly/bootstrap/textarea';
import { MenuEditorTypeComponent } from './fieldTypes/menu-editor';
import { AdminSidebarEditorTypeComponent } from './fieldTypes/admin-sidebar-editor';
import { HomePanelsEditorTypeComponent } from './fieldTypes/home-panels-editor';
import { ValueBindingEditorTypeComponent } from './fieldTypes/value-binding-editor';
import { FigshareCategoryMappingEditorTypeComponent } from './fieldTypes/figshare-category-mapping-editor';
import { CheckboxTypeComponent } from './fieldTypes/checkbox.type';

let configService: any;
let userService: any;
let translationService: any;
let appConfigService: any;

let app: any;

function findFieldByKey(fields: FormlyFieldConfig[] | undefined, key: string): FormlyFieldConfig | undefined {
  if (!fields) {
    return undefined;
  }

  for (const field of fields) {
    if (field.key === key) {
      return field;
    }
    const nested = findFieldByKey(field.fieldGroup, key);
    if (nested) {
      return nested;
    }
    if (field.fieldArray) {
      const fieldArray = field.fieldArray as FormlyFieldConfig | FormlyFieldConfig[];
      if (Array.isArray(fieldArray)) {
        const arrayNested = findFieldByKey(fieldArray, key);
        if (arrayNested) {
          return arrayNested;
        }
      } else {
        if (fieldArray.key === key) {
          return fieldArray;
        }
        const arrayNested = findFieldByKey(fieldArray.fieldGroup, key);
        if (arrayNested) {
          return arrayNested;
        }
      }
    }
  }
  return undefined;
}

describe('AppConfigComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    appConfigService = getStubAppConfigService();
    await TestBed.configureTestingModule({
      declarations: [
        AppConfigComponent, DictionaryTypeComponent, JsonTypeComponent, NavigationRowComponent, NavigationFieldsComponent, NavigationLinkDialogComponent, MockI18NextPipe, SectionTypeComponent, SecretTypeComponent, ChipsTypeComponent,
        ArrayTypeComponent,
        ObjectTypeComponent,
        CheckboxTypeComponent,
        MenuEditorTypeComponent,
        AdminSidebarEditorTypeComponent,
        HomePanelsEditorTypeComponent,
        ValueBindingEditorTypeComponent,
        FigshareCategoryMappingEditorTypeComponent
      ],
      imports: [AdminSaveShortcutComponent,
        ReactiveFormsModule, A11yModule,
        CommonModule,
        FormlyModule.forRoot({
          types: [
            { name: 'app-config-section', component: SectionTypeComponent },
            { name: 'app-config-dictionary', component: DictionaryTypeComponent },
            { name: 'app-config-json', component: JsonTypeComponent },
            { name: 'app-config-secret', component: SecretTypeComponent },
            { name: 'app-config-chips', component: ChipsTypeComponent },
            { name: 'array', component: ArrayTypeComponent },
            { name: 'object', component: ObjectTypeComponent },
            { name: 'textarea', component: FormlyFieldTextArea },
            { name: 'app-config-checkbox', component: CheckboxTypeComponent },
            { name: 'menu-editor', component: MenuEditorTypeComponent },
            { name: 'admin-sidebar-editor', component: AdminSidebarEditorTypeComponent },
            { name: 'home-panels-editor', component: HomePanelsEditorTypeComponent },
            { name: 'value-binding-editor', component: ValueBindingEditorTypeComponent },
            { name: 'figshare-category-mapping-editor', component: FigshareCategoryMappingEditorTypeComponent }
          ],
        }),
        FormlyBootstrapModule,
        FormlyModule.forChild({ wrappers: [{ name: 'form-field', component: FormlyFieldWrapperComponent }] })
      ],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AppConfigService,
          useValue: appConfigService
        },
        FormBuilder,
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: UserService,
          useValue: userService
        }
      ]
    }).compileComponents();
    TestBed.inject(FormBuilder);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);

  });
  it('keeps one translated server header while dependencies are pending, then renders the editor', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const component = fixture.componentInstance;
    component.earlyHeader = { title: 'Domaine autorisé', description: 'Description traduite', adminLabel: 'Administration', breadcrumbLabel: 'Fil', section: 'Comptes', adminUrl: '/default/rdmp/admin' };
    component.title = component.earlyHeader.title;
    component.sidebarSection = component.earlyHeader.section;
    (component as any).brandingAndPortalUrl = '/default/rdmp';
    spyOn(component, 'ngOnInit').and.stub();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.rb-admin-page-header p').textContent).toBe('Description traduite');
    expect(fixture.nativeElement.querySelector('.rb-admin-crumbs').getAttribute('aria-label')).toBe('Fil');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    (component as any).isReady = true;
    component.empty = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);
    fixture.destroy();
  });

  for (const [key, schema, model] of [
    ['oniPublishing', ONI_PUBLISHING_SCHEMA, new OniPublishing()],
    ['raidPublishing', RAID_PUBLISHING_SCHEMA, { ...new RaidPublishing(), types: { title: { Primary: { id: 'primary', schemaUri: 'https://example.test/' } } }, mapping: { dmp: { title: { dest: 'title[0].text', engine: 'jsonata', expression: 'record.metadata.title' } } } }],
    ['integrationNotification', INTEGRATION_NOTIFICATION_SCHEMA, { perIntegration: { oni: { recipients: ['admin@example.test'], statuses: ['failed'], unknown: { preserve: [null, false] } } } }],
  ] as const) {
    it(`${key}: renders its real schema and saves without changing existing nested values`, async () => {
      spyOn(appConfigService, 'getAppConfigForm').and.returnValue({ schema, model, secretFields: key === 'oniPublishing' ? ['sites.*.ingestion.adminToken'] : [] });
      const fixture = TestBed.createComponent(AppConfigComponent);
      const component = fixture.componentInstance;
      component.configKey = key; fixture.autoDetectChanges(true);
      await component.waitForInit(); await fixture.whenStable(); fixture.detectChanges();
      const expected = JSON.parse(JSON.stringify(model));
      expect(JSON.parse(JSON.stringify(component.model))).toEqual(expected);
      expect(fixture.nativeElement.textContent).not.toContain('admin-config-no-editable-settings');
      expect(component.form.valid).toBeTrue();
      component.model.futureExtension = { preserved: true };
      await component.onSubmit(component.model);
      const saved = JSON.parse(JSON.stringify(appConfigService.lastSavedModel));
      if (key === 'oniPublishing') Object.values(saved.sites).forEach((site: any) => { if (site.ingestion?.adminToken === '__REDACTED__') site.ingestion.adminToken = ''; });
      expect(saved).toEqual({ ...expected, futureExtension: { preserved: true } });
      fixture.destroy();
    });
  }

  it('converts additionalProperties, patternProperties and nested dictionaries automatically', () => {
    const converter = TestBed.inject(FormlyJsonschema);
    const value = { type: 'object', additionalProperties: { type: 'string' } };
    for (const schema of [
      { type: 'object', additionalProperties: value },
      { type: 'object', patternProperties: { '^[a-z]+$': value } },
    ]) {
      const field = configSchemaToField(converter, schema as any);
      expect(field.type).toBe('app-config-dictionary');
      const nested = field.props!['dictionaryField']('alpha');
      expect(nested.key).toEqual(['alpha']);
      expect(nested.type).toBe('app-config-dictionary');
      expect(nested.props['dictionaryField']('a.b[0]').key).toEqual(['a.b[0]']);
    }
  });

  it('edits dictionaries with literal keys, collisions, patterns, confirmation and lossless values', async () => {
    const original = { 'old.key[0]': { label: '', extra: { future: [null, false, 0] } }, second: { label: 'Second' } };
    spyOn(appConfigService, 'getAppConfigForm').and.returnValue({
      schema: { type: 'object', properties: { sites: { type: 'object', additionalProperties: {
        type: 'object', properties: { label: { type: 'string', default: 'Must not replace blank' }, count: { type: 'integer', minimum: 1 } }
      } } } }, model: { sites: structuredClone(original) }
    });
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'oniPublishing'; fixture.autoDetectChanges(true);
    await app.waitForInit(); await fixture.whenStable(); fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(DictionaryTypeComponent)).componentInstance as DictionaryTypeComponent;
    expect(app.model.sites).toEqual(original);
    let first = editor.field.fieldGroup![0];
    editor.rename(first, 'second');
    expect(editor.error('second', 'old.key[0]')).toBe('admin-config-dictionary-key-duplicate');
    expect(app.form.invalid).toBeTrue();
    expect(app.model.sites).toEqual(original);
    editor.rename(first, 'renamed.key[1]'); fixture.detectChanges(); await fixture.whenStable();
    expect(Object.keys(app.model.sites)).toEqual(['renamed.key[1]', 'second']);
    expect(app.model.sites['renamed.key[1]']).toEqual(original['old.key[0]']);
    first = editor.field.fieldGroup![0];
    first.formControl!.get('count')!.setValue(0);
    expect(app.form.invalid).toBeTrue();
    first.formControl!.get('count')!.setValue(2);
    expect(app.form.valid).toBeTrue();
    editor.startAdd(first); editor.newKey = 'copy'; editor.add();
    fixture.detectChanges(); await fixture.whenStable();
    expect(app.model.sites.copy).toEqual({ ...original['old.key[0]'], count: 2 });
    expect(app.model.sites.copy).not.toBe(app.model.sites['renamed.key[1]']);
    editor.requestRemove(editor.field.fieldGroup![2], { currentTarget: document.createElement('button') } as any);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(Object.keys(app.model.sites)).toContain('copy');
    editor.cancelRemove(); expect(Object.keys(app.model.sites)).toContain('copy');
    editor.requestRemove(editor.field.fieldGroup![2], { currentTarget: document.createElement('button') } as any); editor.remove();
    fixture.detectChanges(); await fixture.whenStable();
    expect(Object.keys(app.model.sites)).toEqual(['renamed.key[1]', 'second']);
    editor.props['dictionarySchema'] = { patternProperties: { '^[a-z]+$': {} } };
    expect(editor.error('bad key')).toBe('admin-config-dictionary-key-pattern');
    expect(editor.error('valid')).toBe('');
    expect(editor.error('__proto__')).toBe('admin-config-dictionary-key-unsafe');
    await app.onSubmit(app.model);
    expect(appConfigService.lastSavedModel.sites['renamed.key[1]'].extra).toEqual(original['old.key[0]'].extra);
    fixture.destroy();
  });

  it('tracks duplicate and uncommitted dictionary keys, guards leaving and clears drafts on discard', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      sites: { type: 'object', additionalProperties: { type: 'object', properties: { label: { type: 'string' } } } }
    } }, model: { sites: { staging: { label: 'Stage' }, public: { label: 'Public' } } } }, 'oniPublishing');
    const app = fixture.componentInstance;
    const editor = fixture.debugElement.query(By.directive(DictionaryTypeComponent)).componentInstance as DictionaryTypeComponent;
    const child = editor.field.fieldGroup![0];
    await expandAllSections(fixture);
    const input = fixture.nativeElement.querySelector('input[id*="-key-0"]') as HTMLInputElement;
    input.value = 'public'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(app.dirty).toBeTrue();
    expect(app.form.invalid).toBeTrue();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain('admin-config-dictionary-key-duplicate');
    expect(fixture.nativeElement.querySelector('.rb-admin-save-bar .btn-outline-secondary').disabled).toBeFalse();
    const leave = new Event('beforeunload', { cancelable: true });
    app.beforeUnload(leave as BeforeUnloadEvent);
    expect(leave.defaultPrevented).toBeTrue();
    input.value = 'staging'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(app.dirty).toBeFalse();
    editor.startAdd(); editor.newKey = 'public'; editor.draftChanged(); fixture.detectChanges();
    expect(app.dirty).toBeTrue();
    expect(fixture.nativeElement.querySelector('input[id$="-new-key"]').getAttribute('aria-invalid')).toBe('true');
    editor.newKey = 'preview'; editor.draftChanged();
    await app.onSubmit(app.model);
    expect(appConfigService.lastSavedModel).toBeUndefined();
    expect(app.dirty).toBeTrue();
    editor.cancelAdd(); fixture.detectChanges(); expect(app.dirty).toBeFalse();
    editor.rename(child, 'public'); fixture.detectChanges();
    app.discard(); await fixture.whenStable(); fixture.detectChanges();
    expect(app.dirty).toBeFalse();
    expect(app.model.sites.staging.label).toBe('Stage');
    expect(fixture.nativeElement.querySelector('[aria-invalid="true"]')).toBeNull();
    fixture.destroy();
  });

  it('retains masked credentials across dictionary rename and duplicate, including subsequent saves', async () => {
    spyOn(appConfigService, 'getAppConfigForm').and.returnValue({
      schema: ONI_PUBLISHING_SCHEMA, model: { ...new OniPublishing(), sites: { 'old.site[0]': { ingestion: { adminToken: '__REDACTED__' } } } },
      secretFields: ['sites.*.ingestion.adminToken']
    });
    const fixture = TestBed.createComponent(AppConfigComponent), component = fixture.componentInstance;
    component.configKey = 'oniPublishing'; fixture.autoDetectChanges(true);
    await component.waitForInit(); await fixture.whenStable();
    await expandAllSections(fixture);
    const editor = fixture.debugElement.queryAll(By.directive(DictionaryTypeComponent)).map(node => node.componentInstance as DictionaryTypeComponent).find(editor => editor.field.key === 'sites')!;
    editor.rename(editor.field.fieldGroup![0], 'renamed');
    editor.startAdd(editor.field.fieldGroup![0]); editor.newKey = 'copy'; editor.add();
    await fixture.whenStable(); await component.onSubmit(component.model);
    const marker = '__REDACTED_FROM__:' + JSON.stringify(['sites', 'old.site[0]', 'ingestion', 'adminToken']);
    expect(appConfigService.lastSavedModel.sites.renamed.ingestion.adminToken).toBe(marker);
    expect(appConfigService.lastSavedModel.sites.copy.ingestion.adminToken).toBe(marker);
    component.model.defaultSite = 'copy'; await component.onSubmit(component.model);
    expect(appConfigService.lastSavedModel.sites.copy.ingestion.adminToken).toBe('__REDACTED__');
    fixture.destroy();
  });

  it('supports a dictionary at the schema root without replacing the shared form model', async () => {
    spyOn(appConfigService, 'getAppConfigForm').and.returnValue({
      schema: { type: 'object', additionalProperties: { type: 'string' } }, model: { 'old.key': '', second: 'Two' }
    });
    const fixture = TestBed.createComponent(AppConfigComponent), component = fixture.componentInstance;
    component.configKey = 'oniPublishing'; fixture.autoDetectChanges(true);
    await component.waitForInit(); await fixture.whenStable();
    const editor = fixture.debugElement.query(By.directive(DictionaryTypeComponent)).componentInstance as DictionaryTypeComponent;
    const model = component.model;
    editor.rename(editor.field.fieldGroup![0], 'renamed.key');
    fixture.detectChanges(); await fixture.whenStable();
    expect(component.model).toBe(model);
    expect(Object.keys(component.model)).toEqual(['renamed.key', 'second']);
    expect(component.model['renamed.key']).toBe('');
    await component.onSubmit(component.model);
    expect(appConfigService.lastSavedModel).toEqual({ 'renamed.key': '', second: 'Two' });
    fixture.destroy();
  });

  it('summarises dictionary keys without exposing values', () => {
    expect(sectionSummary([{ key: 'sites', type: 'app-config-dictionary', props: { label: 'sites' } }],
      { sites: { public: { token: 'secret' }, staff: {}, archive: {} } }, String)).toBe('3 sites: public, staff, archive');
  });

  for (const style of [undefined, 'info', 'warning', 'critical']) {
    it(`renders the system message style selector and matching preview for ${style}`, async () => {
      spyOn(appConfigService, 'getAppConfigForm').and.returnValue({
        schema: { type: 'object', properties: { title: { type: 'string' }, style: { type: 'string', enum: ['info', 'warning', 'critical'], default: 'info' } } },
        model: { title: 'Notice', ...(style ? { style } : {}) }
      });
      const fixture = TestBed.createComponent(AppConfigComponent);
      const component = fixture.componentInstance;
      component.configKey = 'systemMessage';
      fixture.autoDetectChanges(true);
      await component.waitForInit();
      await fixture.whenStable();
      fixture.detectChanges();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('form select');
      expect(select).toBeTruthy();
      expect(Array.from(select.options).filter(option => option.value).map(option => option.textContent?.trim())).toEqual(['admin-config-message-style-info', 'admin-config-message-style-warning', 'admin-config-message-style-critical']);
      const preview = fixture.nativeElement.querySelector('.app-config-preview-message');
      expect(preview.classList.contains('rb-system-message-' + (style || 'info'))).toBeTrue();
      expect(preview.getAttribute('role')).toBe(style === 'critical' ? 'alert' : 'status');
      select.value = Array.from(select.options).find(option => option.textContent?.trim() === 'admin-config-message-style-critical')!.value;
      select.dispatchEvent(new Event('change')); await fixture.whenStable(); fixture.detectChanges();
      expect(component.model.style).toBe('critical');
      expect(preview.classList.contains('rb-system-message-critical')).toBeTrue();
      fixture.destroy();
    });
  }

  for (const configKey of ['menu', 'homePanels', 'adminSidebar']) {
    it(`confirms reset, reloads defaults and shows a default badge for ${configKey}`, async () => {
      const read = spyOn(appConfigService, 'getAppConfigForm').and.returnValue({ schema: { type: 'object', properties: { label: { type: 'string' } } }, model: { label: 'custom' }, hasOverride: true });
      const fixture = TestBed.createComponent(AppConfigComponent);
      const component = fixture.componentInstance;
      component.configKey = configKey;
      fixture.autoDetectChanges(true);
      await component.waitForInit(); await fixture.whenStable();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.rb-admin-page-header button');
      button.click(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeTruthy();
      expect(appConfigService.resetAppConfig).not.toHaveBeenCalled();
      component.cancelReset(); fixture.detectChanges();
      expect(component.showReset).toBeFalse();
      button.click();
      read.and.resolveTo({ schema: { type: 'object', properties: { label: { type: 'string' } } }, model: { label: 'default' }, hasOverride: false });
      await component.resetConfig(); await fixture.whenStable(); fixture.detectChanges();
      expect(appConfigService.resetAppConfig).toHaveBeenCalledOnceWith(configKey);
      expect(component.model.label).toBe('default');
      expect(component.dirty).toBeFalse();
      expect(fixture.nativeElement.querySelector('.rb-admin-page-header button')).toBeNull();
      expect(fixture.nativeElement.querySelector('.rb-admin-page-header .badge')?.textContent).toContain('admin-config-using-defaults');
      expect(fixture.nativeElement.textContent).toContain('admin-config-reset-success');
      expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeFalsy();
      fixture.destroy();
    });
  }

  it('keeps customisations and reports a reset failure', async () => {
    spyOn(appConfigService, 'getAppConfigForm').and.returnValue({ schema: { type: 'object', properties: { label: { type: 'string' } } }, model: { label: 'custom' }, hasOverride: true });
    appConfigService.resetAppConfig.and.rejectWith(new Error('Unavailable'));
    const fixture = TestBed.createComponent(AppConfigComponent);
    const component = fixture.componentInstance;
    component.configKey = 'menu'; fixture.autoDetectChanges(true);
    await component.waitForInit(); await fixture.whenStable();
    fixture.nativeElement.querySelector('.rb-admin-page-header button').click();
    await component.resetConfig(); fixture.detectChanges();
    expect(component.model.label).toBe('custom');
    expect(component.hasOverride).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('admin-config-reset-error');
    expect(component.formSaving).toBeFalse();
    fixture.destroy();
  });

  it('does not expose reset for other app configs or absent overrides', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const component = fixture.componentInstance;
    component.configKey = 'systemMessage'; fixture.autoDetectChanges(true);
    await component.waitForInit(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.rb-admin-page-header button')).toBeFalsy();
    component.openReset({ currentTarget: document.body } as any);
    expect(component.showReset).toBeFalse();
    component.configKey = 'menu'; component.hasOverride = false;
    component.openReset({ currentTarget: document.body } as any);
    expect(component.showReset).toBeFalse();
    expect(appConfigService.resetAppConfig).not.toHaveBeenCalled();
    fixture.destroy();
  });

  for (const order of [undefined, [], ['third', 'unknown', 'first', 'third']]) {
    it(`renders every schema property with order ${JSON.stringify(order)}`, async () => {
      spyOn(appConfigService, 'getAppConfigForm').and.returnValue({
        fieldOrder: order,
        schema: { type: 'object', properties: { first: { type: 'string' }, second: { type: 'string' }, third: { type: 'string' } } },
        model: {}
      });
      const fixture = TestBed.createComponent(AppConfigComponent);
      fixture.detectChanges();
      await fixture.componentInstance.waitForInit();
      fixture.detectChanges();
      const fields = fixture.componentInstance.sections[0].fieldGroup || [];
      expect(fields.map(field => field.key)).toEqual(order?.length ? ['third', 'first', 'second'] : ['first', 'second', 'third']);
      expect(fixture.nativeElement.querySelectorAll('formly-field input').length).toBe(3);
      fixture.destroy();
    });
  }

  it('shows an initial read error and recovers with retry', async () => {
    const original = appConfigService.getAppConfigForm.bind(appConfigService);
    const read = spyOn(appConfigService, 'getAppConfigForm').and.rejectWith({ status: 403 });
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(AppConfigComponent);
    const component = fixture.componentInstance;
    const waiting = expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges();
    await waiting;
    fixture.detectChanges();
    expect(component.loadPending).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Sign in again');
    expect(fixture.nativeElement.textContent).toContain('admin-config-retry');
    read.and.callFake(original);
    await component.retryLoad();
    await component.waitForInit();
    expect(component.loadError).toBe('');
    expect(configService.refreshConfig).toHaveBeenCalled();
    fixture.destroy();
  });

  it('Check form submission success', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    app.configKey = 'test';
    app.model = { "enabled": true, "title": "Test Title", "message": "Test Message" };
    await app.onSubmit(app.model);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.alert-success')?.textContent).toContain('Configuration saved successfully');
    expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
  });
  it('Check form submission failure', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    app.configKey = 'fail';
    app.model = { "enabled": true, "title": "Test Title", "message": "Test Message" };
    await app.onSubmit(app.model);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain('Configuration failed to save');
    expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
  });

  it('Test form rendering', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.debugElement.nativeElement;

    // There should be a checkbox rendered
    const checkbox = compiled.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    // There should be a text field rendered
    const text = compiled.querySelector('input[type="text"]');
    expect(text).toBeTruthy();
    // There should be a text area rendered
    const textArea = compiled.querySelector('textarea');
    expect(textArea).toBeTruthy();

    // There should be a submit button
    const button = compiled.querySelector('button[type=submit]');
    expect(button).toBeTruthy();
    expect(button.textContent.trim()).toBe('admin-config-save');
    expect(button.disabled).toBeTrue();

  });

  it('renders the master boolean in the page header pill', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const enabledField = findFieldByKey(app.fields, 'enabled');
    expect(enabledField?.type).toBe('app-config-checkbox');
    expect(enabledField?.wrappers).toEqual([]);

    const compiled = fixture.debugElement.nativeElement;
    const checkboxLabel = compiled.querySelector('.app-config-page-switch');
    const checkbox = checkboxLabel?.querySelector('input[type="checkbox"]');

    expect(checkboxLabel).toBeTruthy();
    expect(checkbox).toBeTruthy();
    expect(checkboxLabel.textContent).toContain('admin-config-on');
  });

  it('falls back to the field key when a checkbox label is missing', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'booleanWithoutTitle';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.debugElement.nativeElement;
    const checkboxLabel = compiled.querySelector('.app-config-page-switch');

    expect(checkboxLabel?.textContent).toContain('admin-config-on');
  });

  it('applies the checkbox type to boolean array items', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    const fields: FormlyFieldConfig[] = [{
      key: 'flags',
      type: 'array',
      fieldArray: {
        type: 'boolean'
      }
    }];

    (app as any).applyCheckboxType(fields);

    const flagsFieldArray = fields[0].fieldArray as FormlyFieldConfig;
    expect(flagsFieldArray?.type).toBe('app-config-checkbox');
    expect(flagsFieldArray?.wrappers).toEqual([]);
  });

  for (const [configKey, fieldKey] of [['menu', 'items'], ['homePanels', 'panels'], ['adminSidebar', 'header']]) {
    it(`renders validation feedback inside the unwrapped ${configKey} editor`, async () => {
      const fixture = TestBed.createComponent(AppConfigComponent);
      const app = fixture.componentInstance;
      app.configKey = configKey;
      fixture.autoDetectChanges(true);
      await app.waitForInit();
      await fixture.whenStable();
      const field = findFieldByKey(app.fields, fieldKey)!;
      field.formControl!.setErrors({ required: true });
      app.options.showError = () => true;
      fixture.detectChanges();
      expect(field.wrappers).toEqual([]);
      expect(fixture.nativeElement.querySelector('.rb-navigation-editor > .alert-danger formly-validation-message')).not.toBeNull();
    });
  }

  it('applies menu editor type and hides showSearch for menu config', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'menu';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const itemsField = findFieldByKey(app.fields, 'items');
    const showSearchField = findFieldByKey(app.fields, 'showSearch');

    expect(itemsField?.type).toBe('menu-editor');
    expect(itemsField?.fieldGroup).toBeUndefined();
    expect(showSearchField?.hide).toBeTrue();
  });

  it('applies admin sidebar editor type and hides sections/footerLinks', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'adminSidebar';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const headerField = findFieldByKey(app.fields, 'header');
    const sectionsField = findFieldByKey(app.fields, 'sections');
    const footerLinksField = findFieldByKey(app.fields, 'footerLinks');

    expect(headerField?.type).toBe('admin-sidebar-editor');
    expect(headerField?.fieldGroup).toBeUndefined();
    expect(sectionsField?.hide).toBeTrue();
    expect(footerLinksField?.hide).toBeTrue();
  });

  it('applies home panels editor type for homePanels config', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'homePanels';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const panelsField = findFieldByKey(app.fields, 'panels');

    expect(panelsField?.type).toBe('home-panels-editor');
    expect(panelsField?.fieldGroup).toBeUndefined();
  });

  it('uses figshare custom editors from schema widgets', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'figsharePublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    const titleField = findFieldByKey(app.fields, 'title');
    const mappingTableField = findFieldByKey(app.fields, 'mappingTable');

    expect(titleField?.type).toBe('value-binding-editor');
    expect(mappingTableField?.type).toBe('figshare-category-mapping-editor');
  });

  it('renders doiPublishing profiles as an editable array', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'doiPublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(Array.isArray((app.model as any).profiles)).toBeTrue();
    expect((app.model as any).profiles.length).toBe(1);
    expect((app.model as any).profiles[0].name).toBe('dataPublication');

    const profilesField = findFieldByKey(app.fields, 'profiles');
    const retryField = findFieldByKey(app.fields, 'retry');
    const migrationField = findFieldByKey(app.fields, 'migration');
    const operationsField = findFieldByKey(app.fields, 'operations');
    const validationField = findFieldByKey(app.fields, 'validation');
    const bindingField = findFieldByKey(app.fields, 'url');

    expect(profilesField?.fieldArray).toBeTruthy();
    expect(retryField).toBeTruthy();
    expect(migrationField).toBeFalsy();
    // Fields omitted from a partial order remain editable.
    expect(operationsField).toBeTruthy();
    expect(validationField?.hide).toBeTrue();
    expect(bindingField?.type).toBe('value-binding-editor');

    (app.model as any).defaultProfile = 'changedProfile';
    await app.onSubmit(app.model);
    await fixture.whenStable();

    expect(appConfigService.lastSavedModel).toEqual(app.model);
    expect(appConfigService.lastSavedModel.profiles[0].name).toBe('dataPublication');
  });

  it('keeps custom binding defaults from making a saved form dirty and recreates drafts on discard', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const component = fixture.componentInstance;
    component.configKey = 'figsharePublishing';
    fixture.detectChanges(); await component.waitForInit(); fixture.detectChanges(); await fixture.whenStable();
    const bindingField = findFieldByKey(component.fields, 'title')!;
    const editor = fixture.nativeElement.querySelector('formly-value-binding-editor-type');
    component.model.metadata.title.path = 'changed.path';
    await component.onSubmit(component.model);
    expect(component.dirty).toBeFalse();
    component.model.metadata.title.path = 'discard.this';
    component.discard(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.model.metadata.title.path).toBe('changed.path');
    expect(fixture.nativeElement.querySelector('formly-value-binding-editor-type')).not.toBe(editor);
    expect(component.dirty).toBeFalse();
    fixture.destroy();
  });

  it('keeps control ids, labels and native disclosures unique across binding profiles', async () => {
    const binding = { type: 'object', widget: { formlyConfig: { type: 'value-binding-editor' } } };
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      profileA: { type: 'object', properties: { title: binding } },
      profileB: { type: 'object', properties: { title: binding } }
    } }, model: { profileA: { title: { kind: 'path', path: 'metadata.a' } }, profileB: { title: { kind: 'path', path: 'metadata.b' } } } });
    await expandAllSections(fixture);
    const headers: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button.binding-header'));
    expect(headers.length).toBe(2);
    headers.forEach(header => { expect(header.getAttribute('aria-expanded')).toBe('false'); header.click(); });
    fixture.detectChanges();
    const ids = Array.from(fixture.nativeElement.querySelectorAll('formly-value-binding-editor-type [id]')).map((control: any) => control.id);
    expect(new Set(ids).size).toBe(ids.length);
    headers.forEach(header => {
      expect(header.getAttribute('aria-expanded')).toBe('true');
      expect(fixture.nativeElement.querySelector('[id="' + header.getAttribute('aria-controls') + '"]').hidden).toBeFalse();
    });
    fixture.nativeElement.querySelectorAll('formly-value-binding-editor-type label[for]').forEach((label: HTMLLabelElement) => {
      expect(label.control).not.toBeNull();
      expect(label.control!.closest('formly-value-binding-editor-type')).toBe(label.closest('formly-value-binding-editor-type'));
    });
    fixture.destroy();
  });

  it('shows the DOI field key on binding editors', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'doiPublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    await expandAllSections(fixture);
    const compiled = fixture.debugElement.nativeElement;
    expect(compiled.textContent).toContain('publicationYear');
    expect(compiled.textContent).toContain('admin-config-binding-field-key');
  });

  async function expandAllSections(fixture: ComponentFixture<AppConfigComponent>) {
    for (let depth = 0; depth < 8; depth++) {
      const closed = fixture.nativeElement.querySelectorAll('details:not([open])');
      if (!closed.length) break;
      closed.forEach((details: HTMLDetailsElement) => {
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
      });
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    }
  }

  it('defers closed sections and dictionary editors, preserves validation and retains visited drafts', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      connection: { type: 'object', properties: { host: { type: 'string' } } },
      sites: { type: 'object', additionalProperties: { type: 'object', required: ['label'], properties: { label: { type: 'string', minLength: 1 } } } }
    } }, model: { connection: { host: 'example' }, sites: { staging: { label: '' } } } }, 'oniPublishing');
    const app = fixture.componentInstance;
    const sites = findFieldByKey(app.fields, 'sites')!;
    expect(app.form.invalid).toBeTrue();
    expect(fixture.nativeElement.querySelector('.app-config-dictionary')).toBeNull();
    app.activateSection(app.sections.find(section => section.fieldGroup?.includes(sites))!);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-config-dictionary')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.app-config-dictionary-body')).toBeNull();
    await expandAllSections(fixture);
    const keyInput = fixture.nativeElement.querySelector('input[id*="-key-0"]') as HTMLInputElement;
    keyInput.value = 'draft'; keyInput.dispatchEvent(new Event('input')); fixture.detectChanges();
    const row = keyInput.closest('details')!;
    row.open = false; row.dispatchEvent(new Event('toggle')); fixture.detectChanges();
    expect(app.dirty).toBeTrue();
    row.open = true; row.dispatchEvent(new Event('toggle')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[id*="-key-0"]')).toBe(keyInput);
    expect(keyInput.value).toBe('draft');
    app.discard(); await fixture.whenStable(); fixture.detectChanges();
    expect(app.dirty).toBeFalse();
    expect(app.model.sites.staging.label).toBe('');
    fixture.destroy();
  });

  async function renderConfig(data: any, key = 'test') {
    spyOn(appConfigService, 'getAppConfigForm').and.resolveTo(data);
    const fixture = TestBed.createComponent(AppConfigComponent);
    fixture.componentInstance.configKey = key;
    fixture.detectChanges();
    await fixture.componentInstance.waitForInit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('translates enum labels without changing their values and marks URI and ID controls', async () => {
    translationService.translationMap['admin-config-enum-googleAnalytics'] = 'Google Analytics';
    translationService.translationMap['admin-config-enum-googleTagManager'] = 'Google Tag Manager';
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      provider: { type: 'string', enum: ['googleAnalytics', 'googleTagManager'] },
      engine: { type: 'string', oneOf: [{ const: 'jsonata', title: 'Custom JSONata mapping' }, { const: 'path', title: 'Read record field' }] },
      endpoint: { type: 'string', format: 'uri' }, clientId: { type: 'string' }, title: { type: 'string' }
    } }, model: { provider: 'googleAnalytics', endpoint: 'https://orcid.org/', clientId: 'abc', title: 'Title' } }, 'webAnalytics');
    const options = Array.from(fixture.nativeElement.querySelectorAll('select option')) as HTMLOptionElement[];
    expect(options.map(option => option.textContent?.trim())).toContain('Google Analytics');
    expect(options.map(option => option.textContent?.trim())).toContain('Google Tag Manager');
    expect(options.map(option => option.textContent?.trim())).toContain('Custom JSONata mapping');
    expect(fixture.componentInstance.model.provider).toBe('googleAnalytics');
    expect(fixture.nativeElement.querySelectorAll('.rb-admin-mono input').length).toBe(2);
  });

  it('keeps required validation for active settings and suspends it for disabled page and nested settings', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', required: ['title'], properties: {
      enabled: { type: 'boolean' }, title: { type: 'string' },
      settings: { type: 'object', required: ['url'], properties: { enabled: { type: 'boolean' }, url: { type: 'string' } } },
      mapping: { type: 'object', properties: { field: { type: 'string' } } }
    } }, model: { enabled: true, title: 'Saved', settings: { enabled: true, url: '' }, mapping: {} } }, 'doiPublishing');
    const app = fixture.componentInstance;
    expect(app.form.invalid).toBeTrue();
    const settings = app.form.get('settings')!;
    (settings.get('enabled')! as unknown as FormControl).setValue(false); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(settings.get('url')!.valid).toBeTrue();
    (app.form.get('title')! as unknown as FormControl).setValue(''); fixture.detectChanges(); await fixture.whenStable();
    expect(app.form.invalid).toBeTrue();
    app.setEnabled({ target: { checked: false } } as any); fixture.detectChanges(); await fixture.whenStable();
    expect(app.form.valid).toBeTrue();
    await app.onSubmit(app.model); expect(appConfigService.lastSavedModel.enabled).toBeFalse();
    app.setEnabled({ target: { checked: true } } as any); fixture.detectChanges(); await fixture.whenStable();
    expect(app.form.get('title')!.invalid).toBeTrue();
    fixture.destroy();
  });

  it('places the address tester before the final save bar and announces unsaved state only in a badge', async () => {
    const fixture = await renderAddressTester();
    const tester = fixture.nativeElement.querySelector('.app-config-address-tester');
    const save = fixture.nativeElement.querySelector('.rb-admin-save-bar');
    expect(tester.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tester.querySelector('.rb-admin-form-section-header p').hasAttribute('aria-live')).toBeFalse();
    expect(tester.querySelector('.rb-admin-form-section-header .badge')).toBeNull();
    fixture.componentInstance.model.domainsAaf.push('new.example'); fixture.detectChanges();
    expect(tester.querySelector('.rb-admin-form-section-header [role="status"] .badge').textContent).toContain('admin-config-address-unsaved');
    fixture.destroy();
  });

  it('renders summary labels normally, code values inline and no duplicate enabled state', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      enabled: { type: 'boolean' }, settings: { type: 'object', properties: {
        enabled: { type: 'boolean' }, baseUrl: { type: 'string', format: 'uri' }, name: { type: 'string' }
      } }, mapping: { type: 'object', properties: { field: { type: 'string' } } }
    } }, model: { enabled: true, settings: { enabled: false, baseUrl: 'https://example.test', name: 'Production' } } }, 'doiPublishing');
    fixture.componentInstance.sections[0].props!['expanded'] = false;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('.app-config-summary');
    expect(summary.querySelector('code').textContent).toBe('https://example.test');
    expect(summary.textContent).toContain('Production');
    expect(summary.textContent).not.toContain('Enabled:');
    fixture.destroy();
  });

  it('expands invalid dictionary ancestors, announces all invalid fields, focuses and follows summary links', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      connection: { type: 'object', properties: { host: { type: 'string' } } },
      sites: { type: 'object', additionalProperties: { type: 'object', required: ['label'], properties: {
        label: { type: 'string', minLength: 1 }, count: { type: 'integer', minimum: 1 }
      } } }
    } }, model: { connection: { host: 'example' }, sites: { 'a.b[0]': { label: '', count: 0 } } } }, 'oniPublishing');
    const app = fixture.componentInstance;
    app.model.changed = true;
    expect(app.form.invalid).toBeTrue();
    expect(fixture.nativeElement.querySelector('.app-config-dictionary-body')).toBeNull();
    // Focus is intentionally deferred to the next paint after Formly/native
    // details toggles settle. Await that paint instead of an unbounded event
    // promise (focus can already be on the target without another focusin).
    const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await app.onSubmit(app.model); fixture.detectChanges(); await fixture.whenStable();
    await nextPaint();
    expect(app.invalidFields.length).toBe(2);
    expect(fixture.nativeElement.querySelector('[role="alert"] #config-errors-title')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('details[open]').length).toBeGreaterThanOrEqual(2);
    expect(document.activeElement?.id).toBe(app.invalidFieldId(app.invalidFields[0]));
    const links = fixture.nativeElement.querySelectorAll('[aria-labelledby="config-errors-title"] a');
    links[1].click(); fixture.detectChanges(); await fixture.whenStable();
    await nextPaint();
    expect(document.activeElement?.id).toBe(app.invalidFieldId(app.invalidFields[1]));
    expect(appConfigService.lastSavedModel).toBeUndefined();
  });

  it('lets navigation keys bubble from section switches and hides boolean required markers', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', required: ['enabled'], properties: {
      enabled: { type: 'boolean' }, connection: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
      mapping: { type: 'object', properties: { field: { type: 'string' } } }
    } }, model: { enabled: false, connection: { enabled: false }, mapping: {} } }, 'doiPublishing');
    expect(fixture.nativeElement.querySelector('.app-config-checkbox-required')).toBeNull();
    const input = fixture.nativeElement.querySelector('summary [role="switch"]');
    const bubbled: string[] = [];
    fixture.nativeElement.addEventListener('keydown', (event: KeyboardEvent) => bubbled.push(event.key));
    for (const key of ['Tab', 'Escape', ' ', 'Enter']) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    expect(bubbled).toEqual(['Tab', 'Escape']);
  });

  it('gives switches specific names and current state text, and retitles duplicate root sections', async () => {
    translationService.translationMap['admin-config-enable-setting'] = 'Enable {{setting}}';
    const fixture = await renderConfig({ title: 'DOI publishing', sections: [{ titleKey: 'DOI publishing', fields: ['connection'] }], schema: { type: 'object', properties: {
      enabled: { type: 'boolean' }, connection: { type: 'object', properties: { enabled: { type: 'boolean' }, throttling: { type: 'object', properties: { enabled: { type: 'boolean' } } } } }, mapping: { type: 'object', properties: { field: { type: 'string' } } }
    } }, model: { enabled: false, connection: { enabled: true, throttling: { enabled: false } }, mapping: {} } }, 'doiPublishing');
    const component = fixture.componentInstance;
    const switches = Array.from(fixture.nativeElement.querySelectorAll('[role="switch"]')) as HTMLInputElement[];
    expect(switches.length).toBeGreaterThan(1);
    expect(new Set(switches.map(input => input.getAttribute('aria-label'))).size).toBe(switches.length);
    const pageSwitch = fixture.nativeElement.querySelector('#config-enabled');
    expect(pageSwitch.getAttribute('aria-label')).toBe('admin-config-feature-status');
    expect(fixture.nativeElement.querySelector('#config-enabled-label').textContent).toContain('admin-config-status');
    expect(fixture.nativeElement.querySelector('.app-config-page-switch').textContent).toContain('admin-config-off');
    expect(component.sections[0].props!.label).toBe('admin-config-general');
  });

  it('keeps page status and the off banner tied to saved state while the switch edits a draft', async () => {
    const fixture = await renderConfig({ title: 'System messages', schema: { type: 'object', properties: {
      enabled: { type: 'boolean' }, title: { type: 'string' }
    } }, model: { enabled: false, title: 'Saved' } }, 'systemMessage');
    const component = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    component.setEnabled({ target: { checked: true } } as unknown as Event);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('.app-config-page-switch')?.textContent).toContain('admin-config-off');
    expect(root.querySelector('.app-config-page-switch [role="status"]')?.textContent).toContain('admin-config-turns-on-save');
    expect(root.querySelector('.rb-admin-page-header + .alert-info')).not.toBeNull();
    expect(root.querySelector('.app-config-preview .rb-admin-hint')?.textContent).toContain('admin-config-banner-off');
    await component.onSubmit(component.model); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('.app-config-page-switch')?.textContent).toContain('admin-config-on');
    const hint = root.querySelector('.app-config-page-switch [role="status"]');
    expect(hint?.textContent.trim()).toBe('');
    expect(hint?.getAttribute('aria-live')).toBe('polite');
    expect(root.querySelector('.rb-admin-page-header + .alert-info')).toBeNull();
    component.setEnabled({ target: { checked: false } } as unknown as Event);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('.app-config-page-switch [role="status"]')).toBe(hint);
    expect(hint?.textContent).toContain('admin-config-turns-off-save');
    expect(root.querySelector('.rb-admin-page-header + .alert-info')).toBeNull();
  });

  it('moves section rail focus into the expanded section', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      connection: { type: 'object', properties: { url: { type: 'string' } } },
      mapping: { type: 'object', properties: { name: { type: 'string' } } }
    } }, model: { connection: { url: 'https://example.test' }, mapping: {} } }, 'doiPublishing');
    const component = fixture.componentInstance;
    component.activateSection(component.sections[1]); fixture.detectChanges();
    const section = document.getElementById(component.sections[1].props!['sectionId']);
    expect(section?.querySelector('summary, h2, h3')).toBe(document.activeElement);
    expect((section as HTMLDetailsElement).open).toBeTrue();
  });

  for (const configKey of ['oniPublishing', 'raidPublishing']) {
    it(`${configKey}: tracks unparsed JSON, guards leaving, and restores it on discard`, async () => {
      const fixture = await renderConfig({ schema: { type: 'object', properties: { json: {} } },
        model: { json: { valid: true } } }, configKey);
      const component = fixture.componentInstance;
      const json = fixture.debugElement.query(By.directive(JsonTypeComponent)).componentInstance as JsonTypeComponent;
      json.update('{'); fixture.detectChanges();
      expect(component.model.json).toEqual({ valid: true });
      expect(component.dirty).toBeTrue();
      expect(fixture.nativeElement.querySelector('.rb-admin-save-state').textContent).toContain('admin-config-unsaved');
      expect(fixture.nativeElement.querySelector('.rb-admin-save-bar .btn-outline-secondary').disabled).toBeFalse();
      const event = new Event('beforeunload', { cancelable: true });
      component.beforeUnload(event as BeforeUnloadEvent);
      expect(event.defaultPrevented).toBeTrue();
      const anchor = document.createElement('a'); anchor.href = '/admin';
      const click = { target: anchor, button: 0, preventDefault: jasmine.createSpy() } as any;
      component.confirmNavigation(click);
      expect(click.preventDefault).toHaveBeenCalled();
      component.cancelLeave();
      json.update('{"valid":true}'); fixture.detectChanges();
      expect(component.dirty).toBeFalse();
      json.update('{'); fixture.detectChanges();
      component.discard(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      expect(component.dirty).toBeFalse(); expect(component.form.valid).toBeTrue();
      expect(fixture.nativeElement.querySelector('textarea').value).toBe(JSON.stringify({ valid: true }, null, 2));
      fixture.destroy();
    });
  }

  it('associates JSON parse errors and invalid chips with their inputs', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      json: {}, values: { type: 'array', items: { type: 'integer' } }
    } }, model: { json: { valid: true }, values: [1] } }, 'test');
    const json = fixture.debugElement.query(By.directive(JsonTypeComponent));
    expect(json).not.toBeNull();
    json.componentInstance.update('{'); fixture.detectChanges();
    const input = json.nativeElement.querySelector('textarea');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby'))?.textContent).toContain('admin-config-json-invalid');
    const chips = fixture.debugElement.query(By.directive(ChipsTypeComponent));
    const entry = chips.nativeElement.querySelector('input'); entry.value = 'not a number';
    chips.componentInstance.commit(new Event('blur'), entry); fixture.detectChanges();
    expect(entry.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(entry.getAttribute('aria-describedby'))?.textContent).toContain('admin-config-chip-invalid');
  });

  it('retains the saved off notice and restores nested hints when the draft is enabled', async () => {
    const fixture = await renderConfig({ title: 'System messages', schema: { type: 'object', properties: {
      enabled: { type: 'boolean' }, connection: { type: 'object', properties: { enabled: { type: 'boolean' } } }
    } }, model: { enabled: false, connection: { enabled: false } } }, 'systemMessage');
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.alert-info').length).toBe(1);
    expect(root.querySelector('.app-config-form-main.app-config-settings-off')).not.toBeNull();
    expect(root.querySelector('.app-config-preview')?.closest('.app-config-settings-off')).toBeNull();
    expect(root.querySelectorAll('.rb-admin-hint').length).toBeGreaterThan(0);
    const noticeCount = () => Array.from(root.querySelectorAll('p, .alert')).filter(el => el.textContent?.trim() === 'admin-config-feature-off-help').length;
    expect(noticeCount()).toBe(1);
    fixture.componentInstance.setEnabled({ target: { checked: true } } as unknown as Event);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('.app-config-form-main.app-config-settings-off')).toBeNull();
    expect(noticeCount()).toBe(2);
  });

  it('shows the off notice for notifications without a persisted enabled value', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { enabled: { type: 'boolean' }, recipients: { type: 'array', items: { type: 'string' } } } }, model: {} }, 'integrationNotification');
    expect(fixture.nativeElement.querySelector('.rb-admin-page-header + .alert-info')?.textContent).toContain('admin-config-feature-off-help');
    expect(fixture.componentInstance.model.enabled).toBeUndefined();
  });

  it('puts the account restriction switch in the page header', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { enabled: { type: 'boolean' } } }, model: { enabled: false } }, 'authorizedDomainsEmails');
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('#config-enabled').length).toBe(1);
    expect(root.querySelector('.rb-admin-page-actions #config-enabled')).not.toBeNull();
    expect(root.querySelector('#config-enabled-label')?.textContent).toContain('admin-config-status');
    expect(root.querySelector('#config-restrict')).toBeNull();
  });

  it('names array-row switches with their current position instead of a wildcard', async () => {
    translationService.translationMap['admin-config-enable-setting'] = 'Enable {{setting}}';
    const fixture = await renderConfig({ title: 'DOI publishing', schema: { type: 'object', properties: {
      enabled: { type: 'boolean' }, profiles: { type: 'array', items: { type: 'object', properties: { enabled: { type: 'boolean' } } } },
      connection: { type: 'object', properties: { url: { type: 'string' } } }
    } }, model: { enabled: true, profiles: [{ enabled: true }, { enabled: false }], connection: {} } }, 'doiPublishing');
    const names = Array.from(fixture.nativeElement.querySelectorAll('[role="switch"]') as NodeListOf<HTMLInputElement>).map((input: HTMLInputElement) => input.getAttribute('aria-label'));
    expect(names).toContain('Enable Profiles 1');
    expect(names).toContain('Enable Profiles 2');
    expect(names.some(name => name?.includes('*'))).toBeFalse();
  });

  it('retains Formly error description targets through valid, invalid and corrected values', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      maxAttempts: { type: 'integer', minimum: 1 }
    } }, model: { maxAttempts: 2 } }, 'figsharePublishing');
    const field = findFieldByKey(fixture.componentInstance.fields, 'maxAttempts')!;
    const input = fixture.nativeElement.querySelector('input[type="number"]');
    const target = () => fixture.nativeElement.querySelector('[id="' + input.getAttribute('aria-describedby') + '"]');
    expect(target()).not.toBeNull();
    expect(target().textContent.trim()).toBe('');
    field.formControl!.setValue(0); field.formControl!.markAsTouched(); fixture.detectChanges();
    expect(target().querySelector('[role="alert"]')).not.toBeNull();
    field.formControl!.setValue(3); fixture.detectChanges();
    expect(target()).not.toBeNull();
    expect(target().textContent.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('rb-admin-save-shortcut').nextElementSibling.classList).toContain('rb-admin-save-bar');
    fixture.destroy();
  });

  async function renderConnectionTester(key = 'figsharePublishing') {
    return renderConfig({ schema: { type: 'object', properties: {
      enabled: { type: 'boolean' },
      connection: { type: 'object', properties: { baseUrl: { type: 'string' }, token: { type: 'string' } } },
      mapping: { type: 'object', properties: { field: { type: 'string' } } },
    } }, model: { enabled: true, connection: { baseUrl: 'https://saved.example', token: '__REDACTED__' }, mapping: { field: 'title' } }, secretFields: ['connection.token'] }, key);
  }

  it('links visible field descriptions alongside validation errors and removes hidden descriptions', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      attempts: { type: 'integer', minimum: 1, description: 'How many attempts to make' }
    } }, model: { attempts: 2 } });
    const field = findFieldByKey(fixture.componentInstance.fields, 'attempts')!;
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]');
    const references = () => input.getAttribute('aria-describedby')!.split(/\s+/);
    expect(references()).toEqual([field.id + '-formly-validation-error', field.id + '-description']);
    expect(fixture.nativeElement.querySelector('[id="' + field.id + '-description"]').textContent).toContain('How many attempts');
    field.formControl!.setValue(0); field.formControl!.markAsTouched(); fixture.detectChanges();
    expect(references()).toEqual([field.id + '-formly-validation-error', field.id + '-description']);
    expect(fixture.nativeElement.querySelector('[id="' + field.id + '-formly-validation-error"] [role="alert"]')).not.toBeNull();
    field.props!.description = ''; fixture.detectChanges();
    expect(references()).toEqual([field.id + '-formly-validation-error']);
    expect(fixture.nativeElement.querySelector('[id="' + field.id + '-description"]')).toBeNull();
    fixture.destroy();
  });

  it('keeps chip and secret hint references unique alongside described plain fields', async () => {
    const fixture = await renderConfig({ secretFields: ['token'], schema: { type: 'object', properties: {
      token: { type: 'string' }, values: { type: 'array', items: { type: 'string' } },
      name: { type: 'string', description: 'A plain field description' }
    } }, model: { token: '__REDACTED__', values: ['one'], name: 'Example' } });
    for (const selector of ['app-config-secret input', 'app-config-chips input']) {
      const input: HTMLInputElement = fixture.nativeElement.querySelector(selector);
      const references = input.getAttribute('aria-describedby')!.split(/\s+/);
      expect(references.length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('[id="' + references[0] + '"]').length).toBe(1);
    }
    const ids = Array.from(fixture.nativeElement.querySelectorAll('[id]') as NodeListOf<HTMLElement>).map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    fixture.destroy();
  });

  for (const key of ['figsharePublishing', 'doiPublishing', 'raidPublishing', 'oniPublishing']) {
    for (const baseUrl of ['', 'https://saved.example']) {
      it(`opens the ${key} Connection section on load only when its base URL guard requires it (${baseUrl || 'empty'})`, async () => {
        const fixture = await renderConfig({ schema: { type: 'object', properties: {
          general: { type: 'object', properties: { name: { type: 'string' } } },
          connection: { type: 'object', properties: { baseUrl: { type: 'string' } } }
        } }, model: { general: { name: 'Example' }, connection: { baseUrl } } }, key);
        const connection = fixture.componentInstance.sections.find(section => section.fieldGroup?.some(field => field.key === 'connection'))!;
        const details: HTMLDetailsElement = fixture.nativeElement.querySelector('#' + connection.props!['sectionId']);
        expect(details.open).toBe(key === 'figsharePublishing' && !baseUrl);
        expect(fixture.componentInstance.dirty).toBeFalse();
        expect(appConfigService.lastSavedModel).toBeUndefined();
        fixture.destroy();
      });
    }
  }

  for (const key of ['figsharePublishing', 'doiPublishing', 'raidPublishing', 'oniPublishing']) {
    it(`tests the current ${key} form draft and displays the result and time without saving`, async () => {
      const fixture = await renderConnectionTester(key);
      const component = fixture.componentInstance;
      const button = fixture.nativeElement.querySelector('#test-connection');
      expect(button.type).toBe('button');
      component.model.connection.baseUrl = 'http://draft.example';
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('admin-config-connection-unsaved');
      button.click();
      await fixture.whenStable(); fixture.detectChanges();
      expect(appConfigService.testConnection).toHaveBeenCalledWith(key, jasmine.objectContaining({ connection: { baseUrl: 'http://draft.example', token: '' } }));
      expect(component.connectionResult?.ok).toBeTrue();
      expect(fixture.nativeElement.querySelector('[aria-live="polite"] .rb-admin-hint').textContent).toContain('admin-config-connection-unsaved');
      expect(component.connectionTestedAt).toEqual(jasmine.any(Date));
      expect(fixture.nativeElement.querySelector('.app-config-connection-result').classList).toContain('alert-success');
      expect(fixture.nativeElement.textContent).toContain('admin-config-connection-draft');
      expect(appConfigService.lastSavedModel).toBeUndefined();
      component.model.connection.baseUrl = 'http://new-draft.example'; fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.app-config-connection-result')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('admin-config-connection-unsaved');
      fixture.destroy();
    });
  }
  for (const status of ['auth_failed', 'unreachable', 'timeout', 'tls_error', 'misconfigured', 'unexpected_response']) {
    it(`shows the specific translated ${status} connection failure`, async () => {
      const fixture = await renderConnectionTester();
      appConfigService.testConnection.and.resolveTo({ ok: false, status, latencyMs: 80, message: 'safe' });
      await fixture.componentInstance.testConnection(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('admin-config-connection-' + status);
      expect(fixture.componentInstance.connectionChecking).toBeFalse();
      fixture.destroy();
    });
  }
  it('requires a Figshare base URL before testing and explains the disabled action', async () => {
    const fixture = await renderConnectionTester();
    const field = findFieldByKey(fixture.componentInstance.fields, 'baseUrl')!;
    field.formControl!.setValue('  ');
    await fixture.whenStable(); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('#test-connection');
    expect(button.disabled).toBeTrue();
    const input = fixture.nativeElement.querySelector('[id="' + field.id + '"]');
    expect(input.parentElement.textContent).toContain('admin-config-connection-base-url-hint');
    expect(input.getAttribute('aria-describedby').split(/\s+/)).toContain(field.id + '-connection-hint');
    expect(fixture.nativeElement.querySelectorAll('[id="' + field.id + '-connection-hint"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('#connection-base-url-hint').textContent).toContain('admin-config-connection-base-url-hint');
    await fixture.componentInstance.testConnection();
    expect(appConfigService.testConnection).not.toHaveBeenCalled();
    field.formControl!.setValue('https://example.org');
    await fixture.whenStable(); fixture.detectChanges();
    expect(button.disabled).toBeFalse();
    expect(input.getAttribute('aria-describedby').split(/\s+/)).not.toContain(field.id + '-connection-hint');
    expect(fixture.nativeElement.querySelector('#connection-base-url-hint')).toBeNull();
    fixture.destroy();
  });

  it('disables the connection button during requests and prevents duplicate calls', async () => {
    const fixture = await renderConnectionTester();
    let resolve: (value: any) => void;
    appConfigService.testConnection.and.returnValue(new Promise(done => { resolve = done; }));
    const pending = fixture.componentInstance.testConnection(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#test-connection').disabled).toBeTrue();
    await fixture.componentInstance.testConnection();
    expect(appConfigService.testConnection).toHaveBeenCalledTimes(1);
    resolve!({ ok: true, status: 'ok', latencyMs: 20, message: 'Connection OK' });
    await pending; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#test-connection').disabled).toBeFalse();
    fixture.destroy();
  });
  for (const status of [429, 403, 500]) {
    it(`handles HTTP ${status} safely and allows retry`, async () => {
      const fixture = await renderConnectionTester();
      appConfigService.testConnection.and.rejectWith({ status, message: 'untrusted error' });
      await fixture.componentInstance.testConnection(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(status === 429 ? 'admin-config-connection-rate-limit' : 'admin-config-connection-request-error');
      expect(fixture.nativeElement.textContent).not.toContain('untrusted error');
      expect(fixture.componentInstance.connectionChecking).toBeFalse();
      fixture.destroy();
    });
  }
  it('does not expose the connection tester for unrelated config pages', async () => {
    const fixture = await renderConnectionTester('integrationNotification');
    expect(fixture.nativeElement.querySelector('#test-connection')).toBeNull();
    await fixture.componentInstance.testConnection();
    expect(appConfigService.testConnection).not.toHaveBeenCalled();
    fixture.destroy();
  });

  async function renderAddressTester() {
    return renderConfig({ schema: { type: 'object', properties: {
      enabled: { type: 'boolean' },
      domainsAaf: { type: 'array', items: { type: 'string' } },
      emailsAaf: { type: 'array', items: { type: 'string' } }
    } }, model: { enabled: true, domainsAaf: ['uni.edu.au'], emailsAaf: [] } }, 'authorizedDomainsEmails');
  }

  it('normalizes authorized domain/email chips and suppresses duplicates without saving', async () => {
    const fixture = await renderAddressTester();
    const inputs = fixture.nativeElement.querySelectorAll('app-config-chips input');
    const enter = async (index: number, value: string) => {
      inputs[index].value = value;
      inputs[index].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges(); await fixture.whenStable();
    };
    await enter(0, ' Research.ORG. ');
    await enter(0, 'RESEARCH.org');
    await enter(0, ' Uni.EDU.au. ');
    await enter(1, ' J.Smith@UNI.edu.au ');
    await enter(1, 'j.smith@uni.edu.au');
    expect(fixture.componentInstance.model.domainsAaf).toEqual(['uni.edu.au', 'research.org']);
    expect(fixture.componentInstance.model.emailsAaf).toEqual(['j.smith@uni.edu.au']);
    expect(fixture.nativeElement.textContent).toContain('research.org');
    expect(fixture.nativeElement.textContent).not.toContain('Research.ORG');
    expect(fixture.nativeElement.querySelector('#address-test-help').textContent).toContain('admin-config-address-summary');
    expect(fixture.nativeElement.textContent).not.toContain('admin-config-restrict-new-accounts-help');
    const matchingHint = Array.from(fixture.nativeElement.querySelectorAll('.rb-admin-hint')).find((el: any) => el.textContent.includes('admin-config-account-creation-matching')) as HTMLElement;
    expect(matchingHint.closest('.alert')).toBeNull();
    expect(fixture.nativeElement.querySelector('formly-form').compareDocumentPosition(matchingHint) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(appConfigService.lastSavedModel).toBeUndefined();
    fixture.destroy();
  });

  it('leaves other chip inputs case-sensitive and permits duplicates', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } } }, model: { names: [] } });
    const input = fixture.nativeElement.querySelector('app-config-chips input');
    for (const value of ['Mixed.Case', 'Mixed.Case']) {
      input.value = value; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges(); await fixture.whenStable();
    }
    expect(fixture.componentInstance.model.names).toEqual(['Mixed.Case', 'Mixed.Case']);
    fixture.destroy();
  });

  it('renders the address tester only for authorized domains, and disables invalid input', async () => {
    const ordinary = await renderConfig({ schema: { type: 'object', properties: { enabled: { type: 'boolean' } } }, model: { enabled: true } });
    expect(ordinary.nativeElement.querySelector('#address-test-email')).toBeNull();
    ordinary.destroy();
    // renderConfig installs a read spy; update it for the next fixture.
    (appConfigService.getAppConfigForm as jasmine.Spy).and.resolveTo({ schema: { type: 'object', properties: { enabled: { type: 'boolean' } } }, model: { enabled: true } });
    const fixture = TestBed.createComponent(AppConfigComponent);
    fixture.componentInstance.configKey = 'authorizedDomainsEmails';
    fixture.detectChanges(); await fixture.componentInstance.waitForInit(); fixture.detectChanges();
    const component = fixture.componentInstance;
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.app-config-address-check button');
    expect(button.type).toBe('button');
    expect(button.disabled).toBeTrue();
    component.addressEmail.setValue('bad');
    await component.checkAddress();
    expect(appConfigService.testAuthorizedEmail).not.toHaveBeenCalled();
    expect(component.dirty).toBeFalse();
    fixture.destroy();
  });

  for (const [reason, allowed, key] of [
    ['allowed-domain', true, 'admin-config-address-allowed-rule'],
    ['allowed-exception', true, 'admin-config-address-allowed-rule'],
    ['denied', false, 'admin-config-address-denied'],
    ['disabled', true, 'admin-config-address-off'],
    ['unrestricted', true, 'admin-config-address-empty']
  ] as const) {
    it(`shows the server's ${reason} result without saving`, async () => {
      const fixture = await renderAddressTester();
      const component = fixture.componentInstance;
      component.addressEmail.setValue('person@uni.edu.au');
      component.addressProvider.setValue('oidc');
      appConfigService.testAuthorizedEmail.and.resolveTo({ allowed, reason, matchedRule: 'uni.edu.au' });
      const submit = spyOn(appConfigService, 'saveAppConfig').and.callThrough();
      await component.checkAddress(); fixture.detectChanges();
      expect(appConfigService.testAuthorizedEmail).toHaveBeenCalledOnceWith('person@uni.edu.au', 'oidc', component.model);
      expect(fixture.nativeElement.querySelector('[role="status"] .badge').textContent.trim()).toBe(key);
      expect(fixture.nativeElement.querySelector('.app-config-address-result').classList.contains(allowed ? 'rb-admin-badge-success' : 'rb-admin-badge-danger')).toBeTrue();
      expect(submit).not.toHaveBeenCalled();
      expect(component.dirty).toBeFalse();
      fixture.destroy();
    });
  }

  it('sends unsaved edits and hides results after a rule, email or provider changes', async () => {
    const fixture = await renderAddressTester();
    const component = fixture.componentInstance;
    component.model.domainsAaf.push('draft.org');
    component.addressEmail.setValue('person@draft.org');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('admin-config-address-unsaved');
    await component.checkAddress(); fixture.detectChanges();
    const draft = appConfigService.testAuthorizedEmail.calls.mostRecent().args[2];
    expect(draft.domainsAaf).toEqual(['uni.edu.au', 'draft.org']);
    component.model.domainsAaf.push('later.org');
    expect(draft.domainsAaf).toEqual(['uni.edu.au', 'draft.org']);
    expect(component.addressResult).toBeUndefined();
    await component.checkAddress();
    component.addressEmail.setValue('other@draft.org');
    expect(component.addressResult).toBeUndefined();
    await component.checkAddress();
    component.addressProvider.setValue('oidc');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-config-address-result')).toBeNull();
    fixture.destroy();
  });

  it('prevents duplicate checks, ignores stale responses and supports retry after errors', async () => {
    const fixture = await renderAddressTester();
    const component = fixture.componentInstance;
    component.addressEmail.setValue('person@uni.edu.au');
    let complete!: (value: any) => void;
    appConfigService.testAuthorizedEmail.and.returnValue(new Promise(resolve => { complete = resolve; }));
    const pending = component.checkAddress();
    await component.checkAddress();
    expect(appConfigService.testAuthorizedEmail).toHaveBeenCalledTimes(1);
    component.model.enabled = false;
    complete({ allowed: false, reason: 'denied' });
    await pending;
    expect(component.addressResult).toBeUndefined();
    appConfigService.testAuthorizedEmail.and.rejectWith(new Error('network'));
    await component.checkAddress(); fixture.detectChanges();
    expect(component.addressError).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('admin-config-address-error');
    appConfigService.testAuthorizedEmail.and.resolveTo({ allowed: true, reason: 'disabled' });
    await component.checkAddress();
    expect(component.addressError).toBeFalse();
    expect(component.addressResult?.reason).toBe('disabled');
    expect(component.addressChecking).toBeFalse();
    fixture.destroy();
  });

  it('translates schema presentation without translating stored title properties or defaults', async () => {
    translationService.translationMap['admin-config-label-title'] = 'Title';
    translationService.translationMap['admin-nav-menu'] = 'Menu';
    const schema = { type: 'object', properties: {
      title: { type: 'string', title: 'admin-config-label-title', default: 'admin-nav-menu' }
    } };
    const fixture = await renderConfig({ title: 'admin-nav-menu', schema, model: {} });
    const app = fixture.componentInstance;
    expect(app.title).toBe('Menu');
    expect(findFieldByKey(app.fields, 'title')?.props?.label).toBe('Title');
    expect(app.model.title).toBe('admin-nav-menu');
    expect(schema.properties.title.title).toBe('admin-config-label-title');
    app.model.title = 'admin-config-label-title';
    await app.onSubmit(app.model);
    expect(appConfigService.lastSavedModel.title).toBe('admin-config-label-title');
    fixture.destroy();
  });

  it('tracks edits, undo-to-loaded values, discard and a successful save', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { title: { type: 'string', default: 'Default' } } }, model: {} });
    const component = fixture.componentInstance;
    expect(component.dirty).toBeFalse();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Changed'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    await fixture.whenStable();
    expect(component.dirty).toBeTrue();
    component.discard(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.model.title).toBe('Default');
    expect(component.dirty).toBeFalse();
    const restoredInput: HTMLInputElement = fixture.nativeElement.querySelector('input');
    restoredInput.value = 'Saved'; restoredInput.dispatchEvent(new Event('input')); fixture.detectChanges();
    await fixture.whenStable();
    await component.onSubmit(component.model);
    expect(appConfigService.lastSavedModel).toEqual({ title: 'Saved' });
    expect(component.formSaveSuccessful).toBeTrue();
    expect(component.dirty).toBeFalse();
    fixture.destroy();
  });

  it('keeps a failed save dirty and does not allow duplicate saves', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { title: { type: 'string' } } }, model: { title: 'Original' } });
    const component = fixture.componentInstance;
    component.model.title = 'Changed';
    const save = spyOn(appConfigService, 'saveAppConfig').and.rejectWith(new Error('offline'));
    await component.onSubmit(component.model);
    expect(component.dirty).toBeTrue();
    expect(component.formSaveUnsuccessful).toBeTrue();
    component.formSaving = true;
    await component.onSubmit(component.model);
    expect(save).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('renders secrets blank, preserves them on save and redacts new values from JSON and summaries', async () => {
    const fixture = await renderConfig({
      title: 'Secret config', secretFields: ['connection.password'],
      schema: { type: 'object', properties: {
        connection: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' } } },
        retry: { type: 'object', properties: { attempts: { type: 'number' } } }
      } }, model: { connection: { username: 'admin', password: '__REDACTED__' }, retry: { attempts: 3 } }
    });
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('input[type=password]').value).toBe('');
    component.model.connection.username = 'new admin';
    await component.onSubmit(component.model);
    expect(appConfigService.lastSavedModel.connection.password).toBe('__REDACTED__');
    component.model.connection.password = 'new-secret';
    expect(component.jsonModel).not.toContain('new-secret');
    expect(component.sections[0].props!['summary']()).not.toContain('new-secret');
    await component.onSubmit(component.model);
    expect(appConfigService.lastSavedModel.connection.password).toBe('new-secret');
    expect(component.model.connection.password).toBe('');
    fixture.destroy();
  });

  it('keeps required secrets when a typed replacement is cleared before saving', async () => {
    const fixture = await renderConfig({ secretFields: ['connection.password'],
      schema: { type: 'object', properties: { connection: { type: 'object', required: ['password'], properties: { password: { type: 'string' }, username: { type: 'string' } } } } },
      model: { connection: { password: '__REDACTED__', username: 'original' } }
    });
    const password: HTMLInputElement = fixture.nativeElement.querySelector('input[type=password]');
    password.value = 'replacement'; password.dispatchEvent(new Event('input')); fixture.detectChanges();
    password.value = ''; password.dispatchEvent(new Event('input')); fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.model.connection.username = 'changed';
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    expect(appConfigService.lastSavedModel.connection.password).toBe('__REDACTED__');
    expect(fixture.componentInstance.formSaveSuccessful).toBeTrue();
    fixture.destroy();
  });

  it('allows empty required arrays while retaining explicit minimum item counts', async () => {
    const fixture = await renderConfig({
      schema: { type: 'object', required: ['domainsAaf', 'emailsAaf'], properties: {
        domainsAaf: { type: 'array', items: { type: 'string' }, default: [] },
        emailsAaf: { type: 'array', items: { type: 'string' }, default: [] }
      } }, model: { domainsAaf: [], emailsAaf: [] }
    });
    expect(fixture.componentInstance.form.valid).toBeTrue();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('app-config-chips input');
    input.value = 'example.invalid'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    expect(appConfigService.lastSavedModel).toEqual({ domainsAaf: ['example.invalid'], emailsAaf: [] });
    fixture.destroy();
  });

  it('enforces minItems on a required array', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', required: ['values'], properties: { values: { type: 'array', minItems: 1, items: { type: 'string' } } } }, model: { values: [] } });
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    fixture.destroy();
  });

  it('shows an empty state for an unusable schema and notes for empty nested sections', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { empty: { type: 'object' } } }, model: { empty: { preserved: true } } });
    expect(fixture.nativeElement.textContent).toContain('admin-config-not-setup');
    expect(fixture.nativeElement.querySelector('button[type=submit]')).toBeNull();
    fixture.destroy();
  });

  it('shows a no-editable-settings note alongside supported scalar fields', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { site: { type: 'string' }, empty: { type: 'object' } } }, model: { site: 'public', empty: { preserved: true } } });
    expect(fixture.nativeElement.textContent).toContain('admin-config-no-editable-settings');
    expect(fixture.componentInstance.model.empty).toEqual({ preserved: true });
    fixture.destroy();
  });

  it('does not describe preserved opaque objects as empty in collapsed summaries', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: {
      site: { type: 'string' }, sites: { type: 'object' }, mapping: { type: 'object' }
    } }, model: { site: 'public', sites: { public: { token: 'preserved' } }, mapping: { title: 'metadata.title' } } });
    expect(fixture.componentInstance.longForm).toBeTrue();
    expect(fixture.componentInstance.sections[1].props!['summary']()).toBe('admin-config-no-editable-settings');
    expect(fixture.componentInstance.model.sites).toEqual({ public: { token: 'preserved' } });
    fixture.destroy();
  });

  it('groups partial presentation metadata without dropping fields or changing keys', async () => {
    const fixture = await renderConfig({ sections: [{ titleKey: 'First', fields: ['second', 'unknown'] }],
      schema: { type: 'object', properties: { first: { type: 'string' }, second: { type: 'string' }, third: { type: 'string' } } }, model: { first: 'a', second: 'b', third: 'c' } });
    expect(fixture.componentInstance.sections.flatMap(section => section.fieldGroup!.map(field => field.key))).toEqual(['second', 'first', 'third']);
    expect(fixture.componentInstance.model).toEqual({ first: 'a', second: 'b', third: 'c' });
    fixture.destroy();
  });

  it('keeps removal focus on the next chip, then previous chip, then add input', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { values: { type: 'array', items: { type: 'string' } } } }, model: { values: ['One', 'Two', 'Three'] } });
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('.rb-admin-chip button')) as HTMLButtonElement[];
    buttons()[1].focus(); buttons()[1].click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(buttons()[1]);
    buttons()[1].click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(buttons()[0]);
    buttons()[0].click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('app-config-chips input'));
    fixture.destroy();
  });

  it('keeps array removal focus on adjacent rows and falls back to Add item', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } } } }, model: { rows: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }] } });
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('.app-config-array-item > .text-end button')) as HTMLButtonElement[];
    buttons()[1].focus(); buttons()[1].click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(buttons()[1]);
    buttons()[1].click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(buttons()[0]);
    buttons()[0].click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('formly-array-type > div > .row button'));
    fixture.destroy();
  });

  it('gives category editors separate ids with local label associations', async () => {
    const mapping = { type: 'array', widget: { formlyConfig: { type: 'figshare-category-mapping-editor' } }, items: { type: 'object', properties: { sourceCode: { type: 'string' }, figshareCategoryId: { type: 'integer' } } } };
    const fixture = await renderConfig({ schema: { type: 'object', properties: { first: mapping, second: mapping } }, model: { first: [{ sourceCode: 'A', figshareCategoryId: 1 }], second: [{ sourceCode: 'B', figshareCategoryId: 2 }] } });
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('formly-figshare-category-mapping-editor-type input')) as HTMLInputElement[];
    expect(inputs.length).toBe(4);
    expect(new Set(inputs.map(input => input.id)).size).toBe(4);
    fixture.nativeElement.querySelectorAll('formly-figshare-category-mapping-editor-type label').forEach((label: HTMLLabelElement) => expect(label.control?.closest('formly-figshare-category-mapping-editor-type')).toBe(label.closest('formly-figshare-category-mapping-editor-type')));
    fixture.destroy();
  });

  it('adds numeric chips with the original numeric array shape and supports removal', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { statuses: { type: 'array', items: { type: 'integer', minimum: 100 } } } }, model: { statuses: [408] } });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('app-config-chips input');
    expect(input).toBeTruthy();
    input.value = '429'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.model.statuses).toEqual([408, 429]);
    expect(fixture.componentInstance.dirty).toBeTrue();
    fixture.nativeElement.querySelector('.rb-admin-chip button').click(); fixture.detectChanges();
    expect(fixture.componentInstance.model.statuses).toEqual([429]);
    fixture.destroy();
  });

  it('preserves numeric zero in scalar arrays', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { values: { type: 'array', items: { type: 'number' } } } }, model: { values: [] } });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('app-config-chips input');
    input.value = '0'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.model.values).toEqual([0]);
    fixture.destroy();
  });

  it('rejects invalid numeric chips and clears their error when discarding', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { statuses: { type: 'array', items: { type: 'integer' } } } }, model: { statuses: [408] } });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('app-config-chips input');
    input.value = 'not a number'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); fixture.detectChanges();
    expect(fixture.componentInstance.model.statuses).toEqual([408]);
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    expect(input.value).toBe('not a number');
    expect(fixture.componentInstance.dirty).toBeTrue();
    const leave = new Event('beforeunload', { cancelable: true });
    fixture.componentInstance.beforeUnload(leave as BeforeUnloadEvent);
    expect(leave.defaultPrevented).toBeTrue();
    fixture.componentInstance.discard(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-config-chips.is-invalid')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-config-chips input').value).toBe('');
    expect(fixture.componentInstance.dirty).toBeFalse();
    fixture.destroy();
  });

  it('tracks chip text before commit and clears the draft when erased or committed', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { statuses: { type: 'array', items: { type: 'integer' } } } }, model: { statuses: [408] } });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('app-config-chips input');
    input.value = 'oops'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.componentInstance.dirty).toBeTrue();
    input.value = ''; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.componentInstance.dirty).toBeFalse();
    input.value = '429'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); fixture.detectChanges();
    expect(fixture.componentInstance.model.statuses).toEqual([408, 429]);
    // Undo the committed chip: there must be no leftover local draft.
    fixture.debugElement.query(By.directive(ChipsTypeComponent)).componentInstance.remove(1);
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.dirty).toBeFalse();
    fixture.destroy();
  });

  it('retains array-item validation after replacing scalar rows with chips', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { statuses: { type: 'array', items: { type: 'integer', minimum: 100 } } } }, model: { statuses: [408] } });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('app-config-chips input');
    input.value = '50'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); fixture.detectChanges();
    expect(fixture.componentInstance.model.statuses).toEqual([408, 50]);
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    const save = spyOn(appConfigService, 'saveAppConfig').and.resolveTo({});
    await fixture.componentInstance.onSubmit(fixture.componentInstance.model);
    expect(save).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('reads config breadcrumb sections from the current sidebar heading', async () => {
    const sidebar = document.createElement('aside');
    sidebar.innerHTML = '<section><div class="rb-admin-sidebar-heading">Integrations</div><a class="rb-admin-sidebar-item" aria-current="page">DOI</a></section>';
    document.body.append(sidebar);
    try {
      const fixture = await renderConfig({ schema: { type: 'object', properties: {} }, model: {} });
      expect(fixture.componentInstance.sidebarSection).toBe('Integrations');
      expect(fixture.nativeElement.querySelector('.rb-admin-crumbs').textContent).toContain('Integrations');
      fixture.destroy();
    } finally { sidebar.remove(); }
  });

  it('opens a leave warning for navigation and beforeunload only while dirty', async () => {
    const fixture = await renderConfig({ schema: { type: 'object', properties: { title: { type: 'string' } } }, model: { title: 'Original' } });
    const component = fixture.componentInstance;
    component.model.title = 'Changed';
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(event);
    expect(event.defaultPrevented).toBeTrue();
    const anchor = fixture.nativeElement.querySelector('.rb-admin-crumbs a');
    anchor.click(); fixture.detectChanges();
    expect(component.pendingLeave).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[role=alertdialog]')).toBeTruthy();
    component.cancelLeave(); component.discard();
    const pristine = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(pristine);
    expect(pristine.defaultPrevented).toBeFalse();
    fixture.destroy();
  });

});

export function getStubAppConfigService(recordData: any = {}) {

  return {
    lastSavedModel: undefined as any,
    waitForInit: function () {
      return this;
    },
    isInitializing: function () {
      return false;
    },
    getAppConfigForm(configKey: string) {
      if (configKey === 'menu') {
        return {
          fieldOrder: ['showSearch', 'items'],
          schema: {
            type: 'object',
            properties: {
              showSearch: { type: 'boolean' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    labelKey: { type: 'string' },
                    href: { type: 'string' }
                  }
                }
              }
            }
          },
          model: {
            showSearch: true,
            items: []
          }
        };
      }
      if (configKey === 'homePanels') {
        return {
          fieldOrder: ['panels'],
          schema: {
            type: 'object',
            properties: {
              panels: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    titleKey: { type: 'string' },
                    iconClass: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          labelKey: { type: 'string' },
                          href: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          model: {
            panels: []
          }
        };
      }
      if (configKey === 'adminSidebar') {
        return {
          fieldOrder: ['header', 'sections', 'footerLinks'],
          schema: {
            type: 'object',
            properties: {
              header: {
                type: 'object',
                properties: {
                  titleKey: { type: 'string' },
                  iconClass: { type: 'string' }
                }
              },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    titleKey: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          labelKey: { type: 'string' },
                          href: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              },
              footerLinks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    labelKey: { type: 'string' },
                    href: { type: 'string' }
                  }
                }
              }
            }
          },
          model: {
            header: {
              titleKey: 'menu-admin',
              iconClass: 'fa fa-cog'
            },
            sections: [],
            footerLinks: []
          }
        };
      }
      if (configKey === 'figsharePublishing') {
        return {
          fieldOrder: ['metadata', 'categories'],
          schema: {
            type: 'object',
            properties: {
              metadata: {
                type: 'object',
                properties: {
                  title: {
                    type: 'object',
                    widget: {
                      formlyConfig: {
                        type: 'value-binding-editor'
                      }
                    }
                  }
                }
              },
              categories: {
                type: 'object',
                properties: {
                  mappingTable: {
                    type: 'array',
                    widget: {
                      formlyConfig: {
                        type: 'figshare-category-mapping-editor'
                      }
                    }
                  }
                }
              }
            }
          },
          model: {
            metadata: {
              title: { kind: 'path', path: 'metadata.title' }
            },
            categories: {
              mappingTable: []
            }
          }
        };
      }
      if (configKey === 'booleanWithoutTitle') {
        return {
          fieldOrder: ['enabled'],
          schema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' }
            }
          },
          model: {
            enabled: true
          }
        };
      }
      if (configKey === 'doiPublishing') {
        return {
          fieldOrder: ['enabled', 'defaultProfile', 'connection', 'profiles'],
          schema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              defaultProfile: { type: 'string' },
              connection: {
                type: 'object',
                properties: {
                  baseUrl: { type: 'string' },
                  username: { type: 'string' },
                  password: { type: 'string' },
                  timeoutMs: { type: 'number' },
                  retry: {
                    type: 'object',
                    properties: {
                      maxAttempts: { type: 'number' },
                      baseDelayMs: { type: 'number' },
                      maxDelayMs: { type: 'number' },
                      retryOnStatusCodes: {
                        type: 'array',
                        items: { type: 'number' }
                      },
                      retryOnMethods: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                }
              },
              operations: {
                type: 'object',
                properties: {
                  createEvent: { type: 'string' },
                  updateEvent: { type: 'string' },
                  allowDeleteDraft: { type: 'boolean' },
                  allowStateChange: { type: 'boolean' }
                }
              },
              profiles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    enabled: { type: 'boolean' },
                    label: { type: 'string' },
                    metadata: {
                      type: 'object',
                      properties: {
                        url: {
                          type: 'object',
                          widget: {
                            formlyConfig: {
                              type: 'value-binding-editor'
                            }
                          }
                        },
                        publicationYear: {
                          type: 'object',
                          widget: {
                            formlyConfig: {
                              type: 'value-binding-editor'
                            }
                          }
                        },
                        publisher: {
                          type: 'object',
                          widget: {
                            formlyConfig: {
                              type: 'value-binding-editor'
                            }
                          }
                        },
                        creators: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              sourcePath: { type: 'string' },
                              itemMode: { type: 'string' },
                              name: {
                                type: 'object',
                                widget: {
                                  formlyConfig: {
                                    type: 'value-binding-editor'
                                  }
                                }
                              }
                            }
                          }
                        },
                        titles: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              title: {
                                type: 'object',
                                widget: {
                                  formlyConfig: {
                                    type: 'value-binding-editor'
                                  }
                                }
                              }
                            }
                          }
                        },
                        types: {
                          type: 'object',
                          properties: {
                            resourceTypeGeneral: {
                              type: 'object',
                              widget: {
                                formlyConfig: {
                                  type: 'value-binding-editor'
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    writeBack: {
                      type: 'object',
                      properties: {
                        citationUrlPath: { type: 'string' },
                        citationDoiPath: { type: 'string' }
                      }
                    },
                    validation: {
                      type: 'object',
                      widget: {
                        formlyConfig: {
                          hide: true
                        }
                      },
                      properties: {
                        requireUrl: { type: 'boolean' },
                        requirePublisher: { type: 'boolean' },
                        requirePublicationYear: { type: 'boolean' },
                        requireCreators: { type: 'boolean' },
                        requireTitles: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          },
          model: {
            enabled: true,
            defaultProfile: 'dataPublication',
            connection: {
              baseUrl: 'https://api.test.datacite.org',
              username: 'user',
              password: 'password',
              timeoutMs: 30000,
              retry: {
                maxAttempts: 3,
                baseDelayMs: 500,
                maxDelayMs: 4000,
                retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnMethods: ['get', 'put', 'patch', 'delete']
              }
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true
            },
            profiles: [
              {
                name: 'dataPublication',
                enabled: true,
                label: 'Data Publication',
                metadata: {
                  url: { kind: 'path', path: 'record.metadata.url' },
                  publicationYear: { kind: 'path', path: 'record.metadata.year' },
                  publisher: { kind: 'path', path: 'record.metadata.publisher' },
                  creators: [{
                    sourcePath: 'metadata.creators',
                    itemMode: 'array',
                    name: { kind: 'path', path: 'item.name' }
                  }],
                  titles: [{
                    title: { kind: 'path', path: 'record.metadata.title' }
                  }],
                  types: {
                    resourceTypeGeneral: { kind: 'path', path: 'record.metadata.type' }
                  }
                },
                writeBack: {
                  citationUrlPath: 'metadata.citation_url',
                  citationDoiPath: 'metadata.citation_doi'
                },
                validation: {
                  requireUrl: true,
                  requirePublisher: true,
                  requirePublicationYear: true,
                  requireCreators: true,
                  requireTitles: true
                }
              }
            ]
          }
        };
      }
      return {
        fieldOrder: ["enabled", "title", "message"],
        schema: {
          "type": "object",
          "properties": {
            "enabled": {
              "type": "boolean",
              "title": "Enabled"
            },
            "title": {
              "type": "string"
            },
            "message": {
              "type": "textarea"
            }
          }
        },
        model: {
          enabled: true,
          title: '',
          message: ''
        }
      }
    },
    testConnection: jasmine.createSpy('testConnection').and.resolveTo({ ok: true, status: 'ok', latencyMs: 230, message: 'Connection OK' }),
    resetAppConfig: jasmine.createSpy('resetAppConfig').and.resolveTo({ reset: true }),
    testAuthorizedEmail: jasmine.createSpy('testAuthorizedEmail').and.resolveTo({ allowed: true, reason: 'disabled' }),
    saveAppConfig: function (configKey: string, model: any) {
      this.lastSavedModel = model;
      if (configKey === "fail") {
        return Promise.reject('Failure');
      }
      return new Promise((resolve, reject) => {
        resolve({
          success: true
        });
      });
    }

  }
}
