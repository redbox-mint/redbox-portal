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
/**
 * Base component for a DMP field.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'dmp-field',
  template: '<span #field></span>'
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
   * For DI'ing...
   */
  constructor(@Inject(ComponentFactoryResolver) private componentFactoryResolver: ComponentFactoryResolver, protected app: ApplicationRef){
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
    this.fieldMap[this.field.name].instance = fieldCompRef.instance;
  }
}
