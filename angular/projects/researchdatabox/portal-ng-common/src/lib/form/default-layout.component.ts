import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormComponentLayoutDefinition } from './config.model';
import { isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';
import { AfterViewInit, ChangeDetectorRef, Component, Input, NgZone, OnChanges, SimpleChanges } from '@angular/core';
/**
 * Default Form Component Layout
 * 
 * This component provides additional layout-specific functionality for form components. 
 * 
 * The default layout is the following, which based by the legacy form field layout:
 * 
 * <div>
 *   <label>
 *    Label
 *    <span>Required indicator</span>
 *    <button>Help Button</button>
 *  </label>
 *  <span>Help Text</span> 
 *  <ng-container>The component</ng-container>
 * </div>
 *
 * Other layouts can be defined, 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'redbox-form-default-component-layout',
  template: `
  <ng-container *ngIf="model && componentDefinition">
    <label>layout isVisible {{ isVisible }} expressionStateChanged {{ expressionStateChanged }}</label>
    <ng-container *ngIf="componentDefinition?.config?.label && isVisible" >
      <label [attr.title]="tooltips ? tooltips['labelTT'] : ''">
        <span [innerHtml]="componentDefinition?.config?.label"></span>
        <span class="form-field-required-indicator" [innerHTML]="componentDefinition?.config?.labelRequiredStr"></span>
        <button type="button" class="btn btn-default" *ngIf="componentDefinition?.config?.helpText" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
        <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
        </button>
      </label>
      <span class="help-block" *ngIf="helpTextVisible" [innerHtml]="componentDefinition?.config?.helpText"></span>
    </ng-container>
    <redbox-form-base-wrapper *ngIf="componentClass" [model]="model" [componentClass]="componentClass" [formFieldCompMapEntry]="formFieldCompMapEntry" [attr.title]="tooltips ? tooltips['fieldTT'] : ''" [attr.disabled]="isDisabled ? 'true' : null" [attr.readonly]="isReadonly ? 'true' : null" [expressionStateChanged]="expressionStateChanged" ></redbox-form-base-wrapper>
  </ng-container>
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> implements OnChanges, AfterViewInit {
  helpTextVisible: boolean = false;  
  labelRequiredStr: string = '';
  helpTextVisibleOnInit: boolean = false;
  componentClass?: typeof FormFieldBaseComponent | null;
  public override componentDefinition?: FormComponentLayoutDefinition;
  @Input() public override isVisible: boolean = true;
  @Input() public override expressionStateChanged:boolean = false;

  // constructor(private cdrC: ChangeDetectorRef, private zoneC: NgZone) {
  //   super(cdrC, zoneC);
  // }

  override async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null) {
    await super.initComponent(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout as FormComponentLayoutDefinition;
  }

  override ngAfterViewInit() {
    // super.initConfig();
    // this.initLayoutConfig();
  }

  //Layout specific config values that need to be applied after generic/base component config has been applied 
  private initLayoutConfig() {
    this.isVisible = this.componentDefinition?.config?.visible ?? true;
    this.labelRequiredStr = this.componentDefinition?.config?.labelRequiredStr ?? '';
    this.helpTextVisibleOnInit = this.componentDefinition?.config?.helpTextVisibleOnInit ?? false;
    this.tooltips = this.componentDefinition?.config?.tooltips ?? null;
    if(this.helpTextVisibleOnInit) {
      this.setHelpTextVisibleOnInit();
    }
  }

  private setHelpTextVisibleOnInit() {
    this.helpTextVisible = true;
  }

  toggleHelpTextVisibility() {
    this.helpTextVisible = !this.helpTextVisible;
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.loggerService.info('DefaultLayoutComponent ngOnChanges');
    this.loggerService.info('DefaultLayoutComponent changes');
    this.loggerService.info(changes);
    if(this.expressionStateChanged) {
      this.loggerService.info('DefaultLayoutComponent expressionStateChanged '+this.expressionStateChanged);
      let that = this;
      that.zone.run(() => {
        if(!_isUndefined(that.formFieldComponentRef)) {
          that.initConfig();
          that.formFieldComponentRef.changeDetectorRef.detectChanges();
          that.expressionStateChanged = false;
        }
      });
    }
  }
}