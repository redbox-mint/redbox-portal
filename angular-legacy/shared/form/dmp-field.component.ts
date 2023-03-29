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

import { Component, Input, Inject, ViewChild, ViewContainerRef, ComponentFactoryResolver, ComponentRef, ApplicationRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FieldBase } from './field-base';
import { SimpleComponent } from './field-simple.component';
import * as _ from "lodash";
import * as moment from 'moment';
declare var jQuery: any;
declare var $: any;
/**
 * Base component for a DMP field.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'dmp-field',
  template: '<span [attr.disabled]="isDisabled()" #field></span>'
})
export class DmpFieldComponent {
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

  @Input() isEmbedded: boolean = false;

  @Input() public name: any;

  @Input() public index: number;

  disabledExpression: string;

  @ViewChild('field') fieldElement;

  public disabled:boolean = false;
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
      var variables= {imports: {}};
      _.forOwn(this.fieldMap._rootComp, (val, key) => {
        variables.imports[key] = val;
      });
      variables.imports['moment'] = moment;
      var compiled = _.template(disabledExpression, variables);
      var parentElement = jQuery(this.fieldElement.nativeElement.parentElement);
      if(compiled() == "true") {
        if (!this.disabled) {
          //take note of which elements where already disabled as we dont want to enable them if whole component becomes enabled again
          this.disabledElements = parentElement.find('*:disabled');
          parentElement.find('input').prop( "disabled", true );
          parentElement.find('button').filter((index, buttonElem) => {
            const isHelp = jQuery(buttonElem).find("span[class='glyphicon glyphicon-question-sign']");
            return isHelp.length <= 0;
          }).prop( "disabled", true );
          parentElement.find('textarea').prop( "disabled", true );
          parentElement.find('select').prop( "disabled", true );
          this.disabled = true;
        }
        return 'disabled';
      } else {
        if(this.disabled) {
          //previously disabled so lets re-enable
          parentElement.find('input').prop( "disabled", false );
          parentElement.find('button').prop( "disabled", false );
          parentElement.find('textarea').prop( "disabled", false );
          parentElement.find('select').prop( "disabled", false );
          _.each(this.disabledElements, disabledElement => {
            if (_.isFunction(disabledElement.prop)) {
              disabledElement.prop("disabled",true)
            }
          });
          this.disabledElements = [];
          this.disabled = false;
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
    fieldCompRef.instance.isEmbedded = this.isEmbedded;
    fieldCompRef.instance.name = this.name;
    fieldCompRef.instance.index = this.index;
    // flip thi: make the fields responsible for setting the right fieldMap member
    this.field.setFieldMapEntry(this.fieldMap, fieldCompRef);
    //this.fieldMap[this.field.name].instance = fieldCompRef.instance;
  }
}
