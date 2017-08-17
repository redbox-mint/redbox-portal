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

import { Component, Input, Inject, ViewChild, ViewContainerRef, ComponentFactoryResolver, ComponentRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FieldBase } from '../shared/form/field-base';
import { SimpleComponent } from '../shared/form/field-simple.component';
/**
 * Base component for a DMP field...
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
@Component({
  moduleId: module.id,
  selector: 'dmp-field',
  templateUrl: './dmp-field.component.html'
})
export class DmpFieldComponent {
  @Input() field: FieldBase<any>;
  @Input() form: FormGroup;
  @Input() value: any;
  @Input() fieldMap: any;

  @ViewChild('field', {read: ViewContainerRef}) fieldAnchor: ViewContainerRef;

  constructor(@Inject(ComponentFactoryResolver) private componentFactoryResolver: ComponentFactoryResolver){}

  get isValid() {
    if (this.form && this.form.controls) {
      return this.form.controls[this.field.name].valid;
    }
    return false;
  }

  ngOnChanges() {
    if (!this.field || !this.componentFactoryResolver) {
      return;
    }
    this.fieldAnchor.clear();

    let compFactory = this.componentFactoryResolver.resolveComponentFactory(this.field.compClass);
    let fieldCompRef:ComponentRef<SimpleComponent> = <ComponentRef<SimpleComponent>> this.fieldAnchor.createComponent(compFactory);
    fieldCompRef.instance.field = this.field;
    fieldCompRef.instance.form = this.form;
    fieldCompRef.instance.fieldMap = this.fieldMap;
    this.fieldMap[this.field.name].instance = fieldCompRef.instance;
  }
}
