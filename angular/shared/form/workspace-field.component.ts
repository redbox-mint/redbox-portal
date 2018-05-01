import { Component, Input, Inject, ViewChild, ViewContainerRef, ComponentFactoryResolver, ComponentRef, ApplicationRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FieldBase } from './field-base';
import { SimpleComponent } from './field-simple.component';
import * as _ from "lodash-es";

/**
 * Base component for a Workspace field.
 *
 * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
 *
 */
@Component({
  selector: 'ws-field',
  template: '<span [attr.disabled]="isDisabled()" #field></span>'
})
export class WorkspaceFieldComponent {
  /**
   * The model for this field.
   */
  @Input() field: FieldBase<any>;

  /**
   * Form group
   */
  @Input() form: FormGroup;
  /**
   * The value of this field.
   */
  @Input() value: any;
  /**
   * Field map
   */
  @Input() fieldMap: any;
  /**
   * The DOM node for this field.
   */
  @ViewChild('field', {read: ViewContainerRef}) fieldAnchor: ViewContainerRef;

  /**
   * The parentId of this field
   */
  @Input() parentId: string;

  disabledExpression: string;

  @ViewChild('field') fieldElement;




  /**
  * Elements that were already disabled before we ran isDisabled (so they can be restored disabled)
  */
  private disabledElements: any;

  /**
   * For DI'ing...
   */
  constructor(@Inject(ComponentFactoryResolver) private componentFactoryResolver: ComponentFactoryResolver, protected app: ApplicationRef){
    this.disabledElements = [];
  }
  /**
   * If the form is valid.
   */
  get isValid() {
    if (this.form && this.form.controls) {
      return this.form.controls[this.field.name].valid;
    }
    return false;
  }

  /**
   *
   */
  public isDisabled() {

    var disabledExpression = this.field.options['disabledExpression'];
    if(disabledExpression != null) {

      var imports = this.fieldAnchor;
      var variables= {};
      variables['imports'] = this.fieldMap._rootComp;
      var compiled = _.template(disabledExpression, variables);
      var parentElement = jQuery(this.fieldElement.nativeElement.parentElement);
      if(compiled() == "true") {
        //take note of which elements where already disabled as we dont want to enable them if whole component becomes enabled again
        this.disabledElements = parentElement.find('*:disabled');
        parentElement.find('input').prop( "disabled", true );
        return 'disabled';
      } else {
        if(jQuery(this.fieldElement.nativeElement).prop('disabled') == 'disabled') {
          //previously disabled so lets re-enable
          parentElement.find('input').prop( "disabled", false );
          _.each(this.disabledElements, disabledElement => disabledElement.prop("disabled",true));
        }
        return null;
      }

    }
    return null;
  }

  /**
   * Change handler, instantiates the field component.
   */
  ngOnChanges() {
    if (!this.field || !this.componentFactoryResolver) {
      return;
    }
    this.fieldAnchor.clear();

    let compFactory = this.componentFactoryResolver.resolveComponentFactory(this.field.compClass);
    let fieldCompRef:ComponentRef<SimpleComponent> = <ComponentRef<SimpleComponent>> this.fieldAnchor.createComponent(compFactory, undefined, this.app['_injector']);
    fieldCompRef.instance.injector = this.app['_injector'];
    fieldCompRef.instance.field = this.field;
    fieldCompRef.instance.form = this.form;
    fieldCompRef.instance.fieldMap = this.fieldMap;
    fieldCompRef.instance.parentId = this.parentId;
    this.fieldMap[this.field.name].instance = fieldCompRef.instance;
  }
}
