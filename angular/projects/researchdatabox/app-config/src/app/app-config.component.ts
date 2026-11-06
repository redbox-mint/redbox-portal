// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { configLabel, protectConfigLabelTerms } from './config-label';
import { configSchemaToField } from './dictionary-schema';
import { Component, ElementRef, HostListener, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';

import { BaseComponent, UtilityService, LoggerService, TranslationService, AppConfigService, AuthorizedEmailTestResult, IntegrationConnectionResult } from '@researchdatabox/portal-ng-common';
import { cloneDeep, isEqual } from 'lodash-es';
import { ConfigForm, ConfigSection, SECRET_MASK, SECRET_RETAIN_PREFIX, hasEditableFields, sectionSummary, sectionSummaryParts, visitSecrets } from './config-form';
import { FormlyFormOptions } from '@ngx-formly/core';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { JSONSchema7 } from 'json-schema';
/**
 * Application Config  Component
 *
 */
@Component({
    selector: 'app-config',
    templateUrl: './app-config.component.html',
    standalone: false
})
export class AppConfigComponent extends BaseComponent {

  invalidFields: FormlyFieldConfig[] = [];

  addressEmail = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] });
  addressProvider = new FormControl<'aaf' | 'oidc'>('aaf', { nonNullable: true });
  addressChecking = false;
  private addressCheckedState?: { email: string; provider: 'aaf' | 'oidc'; draft: any };
  private addressCheckedResult?: AuthorizedEmailTestResult;
  private addressCheckFailed = false;

  connectionChecking = false;
  connectionTestedAt?: Date;
  connectionTestedDirty = false;
  connectionReachabilityOnly = false;
  connectionErrorKey = '';
  private connectionCheckedState?: any;
  private connectionCheckedResult?: IntegrationConnectionResult;

  get supportsConnectionTest(): boolean {
    return ['figsharePublishing', 'doiPublishing', 'raidPublishing', 'oniPublishing'].includes(this.configKey);
  }
  get connectionResult(): IntegrationConnectionResult | undefined {
    return isEqual(this.connectionCheckedState, this.model) ? this.connectionCheckedResult : undefined;
  }
  get connectionError(): string {
    return isEqual(this.connectionCheckedState, this.model) ? this.connectionErrorKey : '';
  }
  get connectionDetailKey(): string {
    const status = this.connectionResult?.status;
    return 'admin-config-connection-' + (status === 'ok' && this.connectionReachabilityOnly ? 'reachable' : status);
  }
  async testConnection(): Promise<void> {
    if (!this.supportsConnectionTest || this.connectionChecking || this.formSaving) return;
    this.connectionChecking = true;
    this.connectionCheckedResult = undefined;
    this.connectionErrorKey = '';
    this.connectionCheckedState = cloneDeep(this.model);
    this.connectionTestedDirty = this.dirty;
    const site = this.model.sites?.[this.model.defaultSite];
    this.connectionReachabilityOnly = this.configKey === 'oniPublishing' && site?.ingestion?.enabled !== true;
    try {
      this.connectionCheckedResult = await this.appConfigService.testConnection(this.configKey, cloneDeep(this.connectionCheckedState));
    } catch (error) {
      this.connectionErrorKey = (error as { status?: number })?.status === 429
        ? 'admin-config-connection-rate-limit' : 'admin-config-connection-request-error';
    } finally {
      this.connectionTestedAt = new Date();
      this.connectionChecking = false;
      this.requestRender();
    }
  }

  window: any;
  form = new FormGroup({});
  model: any = {};
  title = '';
  descriptionKey = 'admin-config-description';
  sidebarSection = '';
  sections: FormlyFieldConfig[] = [];
  activeSection = '';
  longForm = false;
  empty = false;
  showJson = false;
  hasOverride = false;
  showReset = false;
  resetSuccessful = false;
  resetFailed = false;
  private resetTrigger?: HTMLElement;
  pendingLeave = '';
  options: FormlyFormOptions = {};
  loadedModel: any = {};
  private currentConfig?: ConfigForm;
  private secretFields: string[] = [];
  private trackingReady = false;
  private allowLeave = false;
  private jsonTrigger?: HTMLElement;
  fields: FormlyFieldConfig[] = [
   
  ];
  configKey: any;
  formSaving: boolean = false;
  formSaveSuccessful: boolean = false;
  formSaveUnsuccessful: boolean = false;


  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) protected utilService: UtilityService,
    @Inject(FormBuilder) private fb: FormBuilder,
    @Inject(DOCUMENT) private document: Document,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(AppConfigService) private appConfigService: AppConfigService,
    private formlyJsonschema: FormlyJsonschema,
    @Inject(ElementRef) elementRef: ElementRef
  ) {
    super();
    this.loggerService.debug(`AppConfig waiting for deps to init...`);
    this.window = this.document.defaultView;
    // set this component's dependencies
    this.configKey = elementRef.nativeElement.getAttribute('configKey');
    this.initDependencies = [translationService, appConfigService];
  }

  protected override async initComponent(): Promise<void> {
    const result = await this.appConfigService.getAppConfigForm(this.configKey) as ConfigForm;
    this.currentConfig = cloneDeep(result);
    this.configureForm(result);
  }

  private retainedSecrets = new Map<string, string[]>();

  private configureForm(result: ConfigForm): void {
    this.invalidFields = [];
    this.hasOverride = result.hasOverride === true;
    const jsonObject = cloneDeep(result.schema) as JSONSchema7;
    // Translate presentation metadata only; property names and stored values stay intact.
    const translateTitles = (value: any): void => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.title === 'string') value.title = protectConfigLabelTerms(this.translationService.t(value.title));
      // Only schema nodes: never translate default config data or enum values.
      for (const child of Object.values(value.properties || {})) translateTitles(child);
      for (const child of Object.values(value.patternProperties || {})) translateTitles(child);
      translateTitles(value.additionalProperties);
      if (Array.isArray(value.items)) value.items.forEach(translateTitles);
      else translateTitles(value.items);
      for (const keyword of ['allOf', 'anyOf', 'oneOf']) value[keyword]?.forEach(translateTitles);
      for (const child of Object.values(value.definitions || {})) translateTitles(child);
      for (const child of Object.values(value.$defs || {})) translateTitles(child);
    };
    translateTitles(jsonObject);
    const originalProperties = jsonObject.properties || {};
    // Older servers/hooks can supply an empty or partial field order. Never drop fields.
    const fieldOrder = [...new Set([...(result.fieldOrder || []), ...Object.keys(originalProperties)])];
    jsonObject.properties = {};
    for (const field of fieldOrder) {
      if (Object.prototype.hasOwnProperty.call(originalProperties, field)) jsonObject.properties[field] = originalProperties[field];
    }
    this.title = this.translationService.t(result.title || jsonObject.title || this.configKey);
    this.descriptionKey = this.navigationEditor ? 'admin-navigation-' + this.configKey + '-description' : this.configKey === 'authorizedDomainsEmails' ? 'admin-config-description-authorized-account-creation' : result.descriptionKey || 'admin-config-description';
    this.sidebarSection = this.document.querySelector('.rb-admin-sidebar-item[aria-current="page"]')
      ?.closest('section')?.querySelector('.rb-admin-sidebar-heading')?.textContent || '';
    this.brandingAndPortalUrl = this.appConfigService.brandingAndPortalUrl || '';
    this.secretFields = result.secretFields || [];
    this.retainedSecrets.clear();
    visitSecrets(result.model, this.secretFields, (parent, key, path) => {
      if (parent[key] === SECRET_MASK) this.retainedSecrets.set(JSON.stringify(path), path);
    });
    this.model = this.editableModel(result.model || {});
    this.options.formState = { ...this.options.formState, pageIsOff: () => !!this.enabledField && this.model.enabled !== true };
    const root = configSchemaToField(this.formlyJsonschema, jsonObject, ['oniPublishing', 'raidPublishing', 'integrationNotification'].includes(this.configKey));
    this.fields = [root];
    this.applyCheckboxType(this.fields);
    this.applyCustomWidgetTypes(this.fields);
    this.decorateFields(this.fields);
    this.empty = !hasEditableFields(root) || !!(result.requiresSetup && !Object.keys(result.model || {}).length);
    const navigation = ['menu', 'homePanels', 'adminSidebar'].includes(this.configKey);
    this.longForm = !navigation && this.configKey !== 'authorizedDomainsEmails' &&
      (root.fieldGroup || []).filter(field => ['object', 'array', 'app-config-dictionary'].includes(String(field.type))).length > 1;
    this.buildSections(root, result.sections);
    root.props = { ...root.props, label: '', root: true };
    root.hooks = { ...root.hooks, onInit: () => queueMicrotask(() => {
      // Capture schema defaults and visual-editor initialization as part of the loaded state.
      this.loadedModel = cloneDeep(this.model);
      this.trackingReady = true;
      this.requestRender();
    }) };
  }

  private editableModel(model: any): any {
    const editable = cloneDeep(model);
    visitSecrets(editable, this.secretFields, (parent, key) => {
      if (parent[key] === SECRET_MASK) parent[key] = '';
    });
    return editable;
  }

  private decorateFields(fields: FormlyFieldConfig[], parentPath: string[] = []): void {
    for (const field of fields) {
      const path = field.key == null ? parentPath : [...parentPath, String(field.key)];
      field.props = { ...field.props };
      if (this.configKey === 'authorizedDomainsEmails' && ['domainsAaf', 'emailsAaf', 'domainsOidc', 'emailsOidc'].includes(String(field.key))) {
        const domain = String(field.key).startsWith('domains');
        field.props.label = this.translationService.t(domain ? 'admin-config-allowed-domains' : 'admin-config-allowed-emails');
        field.props['normalizeChip'] = (value: string) => domain ? value.trim().toLowerCase().replace(/\.$/, '') : value.trim().toLowerCase();
      }
      if (!field.props.label && field.key != null) field.props.label = configLabel(String(field.key));
      if (Array.isArray(field.props.options)) {
        field.props.options = field.props.options.map(option => {
          // Explicit schema titles have already been translated; retain their wording.
          if (typeof option.value !== 'string' || option.label !== option.value) return option;
          const key = 'admin-config-enum-' + option.value;
          const label = this.translationService.t(key);
          return { ...option, label: label === key ? configLabel(String(option.label)) : label };
        });
      }
      if (this.configKey === 'systemMessage' && field.key === 'style') {
        field.props.options = ['info', 'warning', 'critical'].map(value => ({ value, label: this.translationService.t('admin-config-message-style-' + value) }));
      }
      if (field.key === 'enabled') {
        field.props['switch'] = true;
        const context = parentPath.length ? configLabel(parentPath.join(' ')) : this.title;
        field.props['switchLabel'] = this.translationService.t('admin-config-enable-setting', { setting: context });
        // Nested flags are rendered in their object's header.
        if (parentPath.length) field.props['headerEnabled'] = true;
      }
      if (this.secretFields.some(secret => secret.split('.').length === path.length && secret.split('.').every((part, index) => part === '*' || part === path[index]))) {
        field.type = 'app-config-secret';
        field.wrappers = [];
        field.props['secret'] = true;
        // A blank secret preserves its existing value; it must not fail a required validator.
        field.props.required = false;
        if (field.expressions) delete field.expressions['props.required'];
        // JSON-schema's optional-string parser turns blank into undefined. Secrets
        // need a literal blank so clearing an input still preserves the stored value.
        field.parsers = [];
      }
      if (field.type === 'array') {
        // JSON Schema requires the property, not an item. Empty arrays are valid
        // unless minItems says otherwise (e.g. empty provider allow-lists).
        field.props.required = false;
        if (field.expressions) delete field.expressions['props.required'];
      }
      if (!['string', 'number', 'integer', 'enum', 'app-config-checkbox'].includes(String(field.type))) field.className = [field.className, 'app-config-wide-field'].filter(Boolean).join(' ');
      const arrayFactory = field.fieldArray;
      const item = typeof arrayFactory === 'function' ? arrayFactory(field) : arrayFactory;
      if (field.type === 'array' && item && ['string', 'number', 'integer', 'enum'].includes(String(item.type))) {
        field.type = 'app-config-chips';
        field.wrappers = [];
        field.props['chipType'] = item.type;
      }
      if (field.type === 'app-config-dictionary') {
        field.props['dictionaryChange'] = (oldKey: string, newKey?: string, duplicate = false) => {
          // Resolve runtime keys so dictionaries inside array rows use their current numeric index.
          const dictionaryPath: string[] = [];
          let current: FormlyFieldConfig | undefined = field;
          while (current) {
            if (current.key != null) dictionaryPath.unshift(...(Array.isArray(current.key) ? current.key.map(String) : [String(current.key)]));
            current = current.parent;
          }
          const prefix = [...dictionaryPath, oldKey];
          for (const [target, source] of [...this.retainedSecrets]) {
            const parts = JSON.parse(target) as string[];
            if (!prefix.every((part, index) => parts[index] === part)) continue;
            if (!duplicate) this.retainedSecrets.delete(target);
            if (newKey !== undefined) this.retainedSecrets.set(JSON.stringify([...dictionaryPath, newKey, ...parts.slice(prefix.length)]), source);
          }
        };
        const factory = field.props['dictionaryField'];
        field.props['dictionaryField'] = (key: string) => {
          const child = factory(key);
          this.applyCheckboxType([child]);
          // The key occupies one literal path segment, even when it contains punctuation.
          this.decorateFields([child], path);
          return child;
        };
      }
      const required = field.expressions?.['props.required'] ?? field.props.required;
      if (required !== undefined && (typeof required === 'boolean' || typeof required === 'function')) {
        field.expressions = { ...field.expressions, 'props.required': current =>
          !this.settingIsOff(current) && (typeof required === 'function' ? required(current) : required) };
      }
      if (field.fieldGroup) this.decorateFields(field.fieldGroup, path);
      if (typeof arrayFactory === 'function') {
        // Formly creates array item fields lazily, including items added after loading.
        field.fieldArray = root => {
          const child = arrayFactory(root);
          this.applyCheckboxType([child]);
          this.decorateFields([child], [...path, '*']);
          return child;
        };
      } else if (item) {
        this.decorateFields([item], [...path, '*']);
      }
    }
  }

  get navigationEditor(): boolean { return ['menu', 'homePanels', 'adminSidebar'].includes(this.configKey); }

  get messageStyle(): string { return ['warning', 'critical'].includes(this.model.style) ? this.model.style : 'info'; }

  openReset(event: Event): void {
    if (!this.navigationEditor || !this.hasOverride || this.formSaving) return;
    this.resetTrigger = event.currentTarget as HTMLElement;
    this.showReset = true;
  }

  cancelReset(): void {
    if (this.formSaving) return;
    this.showReset = false;
    if ((this.resetTrigger as HTMLButtonElement)?.disabled) this.resetTrigger?.parentElement?.focus();
    else this.resetTrigger?.focus();
  }

  async resetConfig(): Promise<void> {
    if (!this.navigationEditor || !this.showReset || !this.hasOverride || this.formSaving) return;
    this.formSaving = true;
    this.resetFailed = this.resetSuccessful = false;
    this.formSaveSuccessful = this.formSaveUnsuccessful = false;
    try {
      await this.appConfigService.resetAppConfig(this.configKey);
      // Fetch the server-resolved defaults, including installation overrides.
      const result = await this.appConfigService.getAppConfigForm(this.configKey) as ConfigForm;
      this.trackingReady = false;
      this.form = new FormGroup({});
      this.options = {};
      this.currentConfig = cloneDeep(result);
      this.configureForm(result);
      this.resetSuccessful = true;
      this.form.markAsPristine();
    } catch {
      this.resetFailed = true;
    } finally {
      this.formSaving = false;
      this.cancelReset();
    }
  }

  private buildSections(root: FormlyFieldConfig, configured?: ConfigSection[]): void {
    if (this.navigationEditor) { this.sections = []; return; }
    const children = root.fieldGroup || [];
    const enabled = children.find(field => field.key === 'enabled');
    if (enabled) enabled.props = { ...enabled.props, pageEnabled: true };
    const available = children.filter(field => field !== enabled && !field.hide);
    const groups: { label: string; fields: FormlyFieldConfig[] }[] = [];
    const assigned = new Set<FormlyFieldConfig>();
    for (const group of configured || []) {
      const fields = group.fields.map(key => available.find(field => field.key === key)).filter((field): field is FormlyFieldConfig => !!field && !assigned.has(field));
      if (fields.length) {
        groups.push({ label: protectConfigLabelTerms(this.translationService.t(group.titleKey)), fields });
        fields.forEach(field => assigned.add(field));
      }
    }
    const remaining = available.filter(field => !assigned.has(field));
    if (this.longForm) {
      // Keep top-level objects/arrays in schema order; collect scalar settings in one card.
      const scalar = remaining.filter(field => !['object', 'array', 'app-config-dictionary'].includes(String(field.type)) && field.type !== 'app-config-chips');
      if (scalar.length) groups.push({ label: this.translationService.t('admin-config-general'), fields: scalar });
      for (const field of remaining.filter(field => !scalar.includes(field))) groups.push({ label: field.props?.label || String(field.key), fields: [field] });
    } else if (remaining.length || enabled && !groups.length) {
      groups.push({ label: this.translationService.t(this.configKey === 'systemMessage' ? 'admin-config-banner' : this.configKey === 'webAnalytics' ? 'admin-config-analytics' : 'admin-config-settings'), fields: remaining });
    }
    this.sections = groups.map((group, index) => {
      if (group.fields.length === 1 && ['object', 'app-config-dictionary'].includes(String(group.fields[0].type))) group.fields[0].props = { ...group.fields[0].props, flat: true };
      const section: FormlyFieldConfig = {
        type: 'app-config-section', wrappers: [], fieldGroup: group.fields,
        props: { label: group.label.trim().toLowerCase() === (this.title || '').trim().toLowerCase() ? this.translationService.t('admin-config-general') : group.label, description: group.fields.length === 1 ? group.fields[0].props?.description : undefined, sectionId: `config-section-${index}`, collapsible: this.longForm, expanded: index === 0,
          summaryParts: () => sectionSummaryParts(group.fields, this.model, value => this.translationService.t(value ? 'admin-config-on' : 'admin-config-off')),
          summary: () => group.fields.some(hasEditableFields)
            ? sectionSummary(group.fields, this.model, value => this.translationService.t(value ? 'admin-config-on' : 'admin-config-off'))
            : this.translationService.t('admin-config-no-editable-settings'),
          activate: () => { this.activeSection = `config-section-${index}`; } }
      };
      return section;
    });
    this.activeSection = 'config-section-0';
    root.fieldGroup = [...(enabled ? [enabled] : []), ...this.sections, ...children.filter(field => field.hide)];
  }

  private settingIsOff(field: FormlyFieldConfig): boolean {
    if (this.model.enabled === false) return true;
    for (let parent = field.parent; parent; parent = parent.parent) {
      const enabled = parent.fieldGroup?.find(child => child.key === 'enabled');
      if (enabled?.formControl?.value === false) return true;
    }
    return false;
  }

  private addressState() {
    return { email: this.addressEmail.value, provider: this.addressProvider.value, draft: this.model };
  }

  get addressResult(): AuthorizedEmailTestResult | undefined {
    return isEqual(this.addressCheckedState, this.addressState()) ? this.addressCheckedResult : undefined;
  }

  get addressError(): boolean {
    return this.addressCheckFailed && isEqual(this.addressCheckedState, this.addressState());
  }

  get addressResultKey(): string {
    switch (this.addressResult?.reason) {
      case 'allowed-domain':
      case 'allowed-exception': return 'admin-config-address-allowed-rule';
      case 'disabled': return 'admin-config-address-off';
      case 'unrestricted': return 'admin-config-address-empty';
      default: return 'admin-config-address-denied';
    }
  }

  async checkAddress(): Promise<void> {
    if (this.addressChecking || this.addressEmail.invalid || this.configKey !== 'authorizedDomainsEmails') return;
    this.addressChecking = true;
    this.addressCheckedResult = undefined;
    this.addressCheckFailed = false;
    this.addressCheckedState = cloneDeep(this.addressState());
    try {
      const { email, provider, draft } = this.addressCheckedState;
      this.addressCheckedResult = await this.appConfigService.testAuthorizedEmail(email, provider, draft);
    } catch {
      this.addressCheckFailed = true;
    } finally {
      this.addressChecking = false;
      this.requestRender();
    }
  }

  get dirty(): boolean { return this.trackingReady && !isEqual(this.model, this.loadedModel); }
  get enabledField(): FormlyFieldConfig | undefined {
    return this.fields[0]?.fieldGroup?.find(field => field.key === 'enabled');
  }

  setEnabled(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.model.enabled = value;
    this.enabledField?.formControl?.setValue(value);
    this.options.checkExpressions?.(this.fields[0]);
  }

  discard(): void {
    const model = cloneDeep(this.loadedModel);
    this.trackingReady = false;
    this.model = model;
    this.fields = [];
    this.form = new FormGroup({});
    this.options = {};
    this.formSaveSuccessful = this.formSaveUnsuccessful = false;
    // Custom editors retain local draft state. Recreate them so discard restores
    // both their controls and their previews, without reapplying defaults over a saved model.
    this.requestRender();
    queueMicrotask(() => {
      this.configureForm({ ...this.currentConfig!, model });
      this.requestRender();
    });
  }

  activateSection(section: FormlyFieldConfig): void {
    section.props!['expanded'] = true;
    this.activeSection = section.props!['sectionId'];
    const element = this.document.getElementById(this.activeSection);
    if (element instanceof HTMLDetailsElement) element.open = true;
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const heading = element?.querySelector<HTMLElement>('summary, h2, h3');
    if (heading) {
      if (heading.tagName !== 'SUMMARY') heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  @HostListener('window:scroll')
  updateActiveSection(): void {
    if (!this.longForm) return;
    const current = this.sections.filter(section => {
      const element = this.document.getElementById(section.props!['sectionId']);
      return element && element.getBoundingClientRect().top <= 120;
    }).pop();
    if (current) this.activeSection = current.props!['sectionId'];
  }

  openJson(): void {
    this.jsonTrigger = this.document.activeElement as HTMLElement;
    this.showJson = true;
  }
  closeJson(): void { this.showJson = false; this.jsonTrigger?.focus(); }
  get jsonModel(): string {
    const model = cloneDeep(this.model);
    visitSecrets(model, this.secretFields, (parent, key) => { if (parent[key]) parent[key] = SECRET_MASK; });
    return JSON.stringify(model, null, 2);
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty && !this.allowLeave) { event.preventDefault(); event.returnValue = ''; }
  }

  @HostListener('document:click', ['$event'])
  confirmNavigation(event: MouseEvent): void {
    if (!this.dirty || this.allowLeave || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return;
    event.preventDefault();
    this.jsonTrigger = this.document.activeElement as HTMLElement;
    this.pendingLeave = anchor.href;
  }
  cancelLeave(): void { this.pendingLeave = ''; this.jsonTrigger?.focus(); }
  leavePage(): void { this.allowLeave = true; this.window.location.assign(this.pendingLeave); }

  private applyCheckboxType(fields: FormlyFieldConfig[]): void {
    for (const field of fields) {
      this.applyCheckboxTypeToField(field);
    }
  }

  private applyCheckboxTypeToField(field: FormlyFieldConfig): void {
    if (field.type === 'checkbox' || field.type === 'boolean') {
      field.type = 'app-config-checkbox';
      field.wrappers = [];
    }
    if (field.fieldGroup) {
      this.applyCheckboxType(field.fieldGroup);
    }
    const fieldArray = field.fieldArray as FormlyFieldConfig | FormlyFieldConfig[] | undefined;
    if (Array.isArray(fieldArray)) {
      this.applyCheckboxType(fieldArray);
    } else if (fieldArray) {
      this.applyCheckboxTypeToField(fieldArray);
    }
  }

  /**
   * Apply custom Formly widget types for specific config models.
   * This enables using rich visual editors instead of generic array/object components.
   */
  private applyCustomWidgetTypes(fields: FormlyFieldConfig[]): void {
    // Menu config: Use menu-editor for the items field
    if (this.configKey === 'menu') {
      this.applyWidgetTypeToField(fields, 'items', 'menu-editor');
      this.hideFieldByKey(fields, 'showSearch');
    }
    
    // Admin sidebar config: Use admin-sidebar-editor for the header field
    // The editor handles all three fields (header, sections, footerLinks) in a unified UI
    if (this.configKey === 'adminSidebar') {
      this.applyWidgetTypeToField(fields, 'header', 'admin-sidebar-editor');
      this.hideFieldByKey(fields, 'sections');
      this.hideFieldByKey(fields, 'footerLinks');
    }

    // Home panels config: Use home-panels-editor for the panels field
    if (this.configKey === 'homePanels') {
      this.applyWidgetTypeToField(fields, 'panels', 'home-panels-editor');
    }
  }

  /**
   * Recursively find a field by key and apply a custom widget type.
   */
  private applyWidgetTypeToField(fields: FormlyFieldConfig[], key: string, widgetType: string): void {
    for (const field of fields) {
      if (field.key === key) {
        field.type = widgetType;
        field.wrappers = [];
        field.props = { ...field.props, label: '' };
        // Clear fieldGroup since the custom widget handles its own rendering
        field.fieldGroup = undefined;
        field.fieldArray = undefined;
        return;
      }
      if (field.fieldGroup) {
        this.applyWidgetTypeToField(field.fieldGroup, key, widgetType);
      }
    }
  }

  /**
   * Hide a field by key so it does not render in the generated form.
   */
  private hideFieldByKey(fields: FormlyFieldConfig[], key: string): void {
    for (const field of fields) {
      if (field.key === key) {
        field.hide = true;
        return;
      }
      if (field.fieldGroup) {
        this.hideFieldByKey(field.fieldGroup, key);
      }
    }
  }

  invalidFieldId(field: FormlyFieldConfig): string {
    return field.id + (field.type === 'app-config-chips' ? '-add' : field.type === 'app-config-dictionary' ? '-dictionary' : '');
  }

  invalidFieldLabel(field: FormlyFieldConfig): string {
    const labels: string[] = [];
    let current: FormlyFieldConfig | undefined = field;
    while (current?.parent) {
      if (current.props?.label) labels.unshift(String(current.props.label));
      current = current.parent;
    }
    return labels.join(' / ') || String(field.key || this.title);
  }

  focusInvalidField(field: FormlyFieldConfig): void {
    let parent: FormlyFieldConfig | undefined = field;
    while (parent) {
      if (parent.props) {
        if (parent.props['collapsible']) parent.props['expanded'] = true;
        parent.props['entryExpanded'] = true;
      }
      parent = parent.parent;
    }
    this.options.detectChanges?.(this.fields[0]);
    this.requestRender();
    setTimeout(() => {
      const element = this.document.getElementById(this.invalidFieldId(field));
      const control = element?.matches('input, select, textarea, button') ? element :
        element?.querySelector<HTMLElement>('.is-invalid, input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)');
      // Also reveal native details ancestors before focusing a nested control.
      for (let ancestor = control?.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      }
      // Native toggle events and Formly validation may replace the input. Resolve it
      // again after they render, then move focus to the current control.
      requestAnimationFrame(() => {
        const current = this.document.getElementById(control?.id || '');
        current?.scrollIntoView({ block: 'center' });
        current?.focus();
      });
    }, 0);
  }

  async onSubmit(model: any): Promise<void> {
    if (this.formSaving || !this.dirty) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const collect = (fields: FormlyFieldConfig[]): FormlyFieldConfig[] => fields.flatMap(field => {
        if (field.hide || !field.formControl?.invalid) return [];
        const children = field.type === 'app-config-chips' ? [] : collect(field.fieldGroup || []);
        const ownError = field.formControl.errors && (field.key != null || field.type === 'app-config-dictionary');
        return [...(ownError ? [field] : []), ...children];
      });
      this.invalidFields = collect(this.fields);
      this.options.showError = field => !!field.formControl?.invalid;
      if (this.invalidFields.length) this.focusInvalidField(this.invalidFields[0]);
      return;
    }
    this.invalidFields = [];
    this.formSaving = true;
    this.formSaveUnsuccessful = this.formSaveSuccessful = false;
    const payload = cloneDeep(model);
    // Only the server's reserved marker preserves a stored secret. Never invent a masked value.
    visitSecrets(payload, this.secretFields, (parent, key, path) => {
      if (parent[key] == null || parent[key] === '') {
        const source = this.retainedSecrets.get(JSON.stringify(path));
        parent[key] = source && JSON.stringify(source) !== JSON.stringify(path) ? SECRET_RETAIN_PREFIX + JSON.stringify(source) : SECRET_MASK;
      }
    });
    try {
      await this.appConfigService.saveAppConfig(this.configKey, payload);
      // Keep the form adapter's shape (e.g. DOI profiles) and clear newly entered secrets.
      visitSecrets(model, this.secretFields, (parent, key, path) => {
        if (parent[key] || this.retainedSecrets.has(JSON.stringify(path))) this.retainedSecrets.set(JSON.stringify(path), path);
        parent[key] = '';
      });
      const clearSecretControls = (fields: FormlyFieldConfig[]): void => {
        for (const field of fields) {
          if (field.props?.['secret']) field.formControl?.setValue('', { emitEvent: false });
          if (field.fieldGroup) clearSecretControls(field.fieldGroup);
        }
      };
      clearSecretControls(this.fields);
      // Rebuilding here would reintroduce schema defaults into custom bindings.
      this.loadedModel = cloneDeep(this.model);
      this.form.markAsPristine();
      this.hasOverride = true;
      if (this.currentConfig) this.currentConfig.hasOverride = true;
      this.resetSuccessful = this.resetFailed = false;
      this.formSaveSuccessful = true;
    } catch (error) {
      this.formSaveUnsuccessful = true;
    } finally {
      this.formSaving = false;
    }
  }
}
