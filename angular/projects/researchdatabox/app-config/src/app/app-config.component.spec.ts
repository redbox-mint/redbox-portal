import { NavigationRowComponent } from './fieldTypes/navigation-editor/navigation-row.component';
import { NavigationFieldsComponent } from './fieldTypes/navigation-editor/navigation-fields.component';
import { NavigationLinkDialogComponent } from './fieldTypes/navigation-editor/navigation-link-dialog.component';
import { Pipe, PipeTransform } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { SectionTypeComponent } from './fieldTypes/section.type';
import { SecretTypeComponent } from './fieldTypes/secret.type';
import { ChipsTypeComponent } from './fieldTypes/chips.type';

@Pipe({ name: 'i18next', standalone: false })
class MockI18NextPipe implements PipeTransform {
  transform(value: string, options?: any): string { return value; }
}
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AppConfigComponent } from './app-config.component';
import { UtilityService, LoggerService, UserService, TranslationService, ConfigService, AppConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';
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
        AppConfigComponent, NavigationRowComponent, NavigationFieldsComponent, NavigationLinkDialogComponent, MockI18NextPipe, SectionTypeComponent, SecretTypeComponent, ChipsTypeComponent,
        ArrayTypeComponent,
        ObjectTypeComponent,
        CheckboxTypeComponent,
        MenuEditorTypeComponent,
        AdminSidebarEditorTypeComponent,
        HomePanelsEditorTypeComponent,
        ValueBindingEditorTypeComponent,
        FigshareCategoryMappingEditorTypeComponent
      ],
      imports: [
        ReactiveFormsModule, A11yModule,
        CommonModule,
        FormlyModule.forRoot({
          types: [
            { name: 'app-config-section', component: SectionTypeComponent },
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
        FormlyBootstrapModule
      ],
      providers: [
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
    it(`confirms reset, reloads defaults and disables reset for ${configKey}`, async () => {
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
      expect(button.disabled).toBeTrue();
      expect(button.parentElement?.title).toBe('admin-config-reset-unavailable');
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
    app.onSubmit(app.model);

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
    app.onSubmit(app.model);
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

  it('renders boolean fields with the checkbox next to the label', async () => {
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
    const checkboxLabel = compiled.querySelector('.app-config-checkbox-label');
    const checkbox = checkboxLabel?.querySelector('input[type="checkbox"]');

    expect(checkboxLabel).toBeTruthy();
    expect(checkbox).toBeTruthy();
    expect(checkboxLabel.textContent).toContain('Enabled');
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
    const checkboxLabel = compiled.querySelector('.app-config-checkbox-label');

    expect(checkboxLabel?.textContent).toContain('Enabled');
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

  it('shows the DOI field key on binding editors', async () => {
    const fixture = TestBed.createComponent(AppConfigComponent);
    const app = fixture.componentInstance;
    app.configKey = 'doiPublishing';

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.debugElement.nativeElement;
    expect(compiled.textContent).toContain('publicationYear');
    expect(compiled.textContent).toContain('Field Key');
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

  async function renderAddressTester() {
    return renderConfig({ schema: { type: 'object', properties: {
      enabled: { type: 'boolean' },
      domainsAaf: { type: 'array', items: { type: 'string' } },
      emailsAaf: { type: 'array', items: { type: 'string' } }
    } }, model: { enabled: true, domainsAaf: ['uni.edu.au'], emailsAaf: [] } }, 'authorizedDomainsEmails');
  }

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
    fixture.componentInstance.discard(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-config-chips.is-invalid')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-config-chips input').value).toBe('');
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
