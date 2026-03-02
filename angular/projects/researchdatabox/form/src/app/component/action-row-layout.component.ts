import {
  Component,
  ComponentRef,
  ViewChild,
  ViewContainerRef,
  isDevMode,
} from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import {
  ActionRowAlignmentOptionsType,
  ActionRowLayoutName,
  FieldLayoutDefinitionFrame,
  FormFieldComponentStatus,
} from '@researchdatabox/sails-ng-common';
import { isNull as _isNull, isUndefined as _isUndefined, set as _set } from 'lodash-es';
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { GroupFieldComponent } from './group.component';

@Component({
  selector: 'redbox-form-action-row-layout',
  template: `
    <div
      [class]="getStringProperty('containerCssClass')"
      [style.justify-content]="justifyContent"
      [style.flex-wrap]="wrapMode"
      [class.rb-form-action-row--compact]="isCompact"
    >
      <ng-container #componentContainer></ng-container>
    </div>
  `,
  standalone: false,
})
export class ActionRowLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> {
  protected override logName = ActionRowLayoutName;
  public override componentDefinition?: FieldLayoutDefinitionFrame;
  componentClass?: typeof FormFieldBaseComponent<ValueType>;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false })
  componentContainer!: ViewContainerRef;

  wrapperComponentRef!: ComponentRef<FormBaseWrapperComponent<ValueType>>;
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass as typeof FormFieldBaseComponent<ValueType>;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout;

    if (!_isUndefined(this.formFieldCompMapEntry) && !_isNull(this.formFieldCompMapEntry)) {
      this.formFieldCompMapEntry.layout = this as FormFieldBaseComponent<ValueType>;
    }

    if (_isUndefined(this.formFieldCompMapEntry?.compConfigJson?.layout?.name) && this.formFieldCompMapEntry) {
      const compConfigName = this.formFieldConfigName('default');
      _set(this.formFieldCompMapEntry, `compConfigJson.layout.name`, `${compConfigName}-layout`);
    }

    if (!_isUndefined(this.formFieldCompMapEntry?.compConfigJson?.layout?.name)) {
      this.name = this.formFieldCompMapEntry?.compConfigJson?.layout?.name;
    }
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    if (!this.componentContainer) {
      throw new Error(`${this.logName}: componentContainer is not defined.`);
    }
    if (!this.formFieldCompMapEntry) {
      throw new Error(`${this.logName}: formFieldCompMapEntry is not defined.`);
    }

    this.wrapperComponentRef = this.componentContainer.createComponent(FormBaseWrapperComponent<ValueType>);
    const wrapperComponent = await this.wrapperComponentRef.instance.initWrapperComponent(this.formFieldCompMapEntry, true);
    if (wrapperComponent !== null) {
      this.formFieldCompMapEntry.component = wrapperComponent;
    }

    this.applySlotCssClassToChildren(wrapperComponent);
    this.warnForLegacyRowLayouts(wrapperComponent);
    await super.setComponentReady();
  }

  override ngAfterViewInit() {
    this.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
  }

  protected get justifyContent(): string {
    const alignment = this.getStringProperty('alignment') as ActionRowAlignmentOptionsType;
    if (alignment === 'start') {
      return 'flex-start';
    }
    if (alignment === 'space-between') {
      return 'space-between';
    }
    return 'flex-end';
  }

  protected get wrapMode(): string {
    return this.getBooleanProperty('wrap', true) ? 'wrap' : 'nowrap';
  }

  protected get isCompact(): boolean {
    return this.getBooleanProperty('compact', false);
  }

  private applySlotCssClassToChildren(wrapperComponent: FormFieldBaseComponent<ValueType> | null): void {
    if (!(wrapperComponent instanceof GroupFieldComponent)) {
      return;
    }

    const slotCssClass = this.resolvedSlotCssClass;
    wrapperComponent.formFieldCompMapEntries.forEach((entry) => {
      const wrapperRef = entry.componentRef;
      const wrapperInstance = wrapperRef?.instance;
      if (!wrapperInstance) {
        return;
      }

      wrapperInstance.hostBindingCssClasses = this.mergeCssClasses(
        `${wrapperInstance.hostBindingCssClasses ?? ''}`,
        slotCssClass
      );
      wrapperRef.changeDetectorRef.detectChanges();
    });
  }

  private warnForLegacyRowLayouts(wrapperComponent: FormFieldBaseComponent<ValueType> | null): void {
    if (!isDevMode() || !(wrapperComponent instanceof GroupFieldComponent)) {
      return;
    }

    const slotCssClass = this.resolvedSlotCssClass;
    wrapperComponent.formFieldCompMapEntries.forEach((entry) => {
      const resolvedClasses = `${entry.componentRef?.instance?.hostBindingCssClasses ?? ''}`;
      const hasLegacyRow = /(^|\s)row(\s|$)/.test(resolvedClasses);
      const hasSlotClass = this.hasCssClass(resolvedClasses, slotCssClass);
      if (hasLegacyRow && !hasSlotClass) {
        this.loggerService.warn(
          `${this.logName}: Action row child '${entry.compConfigJson?.name ?? 'unknown'}' resolved to legacy 'row' classes without the configured slot class '${slotCssClass}'.`
        );
      }
    });
  }

  private get resolvedSlotCssClass(): string {
    return this.getStringProperty('slotCssClass') || 'rb-form-action-slot';
  }

  private hasCssClass(cssClasses: string, targetClass: string): boolean {
    const classNames = cssClasses.split(/\s+/).map((cssClass) => cssClass.trim()).filter(Boolean);
    return classNames.includes(targetClass);
  }

  private mergeCssClasses(existingCssClasses: string, appendCssClass: string): string {
    const classSet = new Set(
      `${existingCssClasses} ${appendCssClass}`
        .split(/\s+/)
        .map((cssClass) => cssClass.trim())
        .filter(Boolean)
    );
    return Array.from(classSet).join(' ');
  }
}
