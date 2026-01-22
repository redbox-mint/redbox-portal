// Copyright (c) 2021 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { Component } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { NotInFormField } from './field-simple';
import * as _ from "lodash";
import * as moment from 'moment';
import * as numeral from 'numeral';
/**
 * Allows the form to set the page title of the current page.
 * 
 * Sample config: 
 * {
 *   class: 'PageTitle'
 *   compClass: 'PagetTitleComponent',
 *   definition: {
 *     name: 'pageTitle', 
 *     // specify either `sourceProperty` or `template`, setting `template` will ignore the `sourceProperty` object.
 *     sourceProperty: 'title.control.value', // Use this for simple definitions, allow _.get style access to the values in the `fieldMap` object
 *     template: '' // Use for advanced templating, `field` will be this field, and thus has `fieldMap`, and also has `_rootComp`, allowing for very advanced access.
 *      subscribe: {
 *       'form': {
 *          // Update the title on form load, when creating, when saved... can be whenever an event fires off
            onFormLoaded: [
              { action: 'updateTitle' }
            ],
            recordCreated: [
              { action: 'updateTitle' }
            ],
            recordSaved: [
              { action: 'updateTitle' }
            ]
          }
 *      }
 *   }
 * }
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 * @param  options
 * @param  injector
 */
export class PageTitle extends NotInFormField {
  sourceProperty: string;
  template: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.sourceProperty = options['sourceProperty'];
    this.template = options['template'];
  }

  public getGroup(group: any, fieldMap: any): any {
    const retval = super.getGroup(group, fieldMap);
    return retval;
  }

  public updateTitle() {
    let pageTitle = null;
    if (!_.isEmpty(this.sourceProperty)) {
      pageTitle = _.get(this.fieldMap, this.sourceProperty);
    } else {
      if (_.isEmpty(this.template)) {
        console.error(`PageTitle:: Template not specified!`);
      } else {
        const imports = _.extend({ moment: moment, numeral: numeral, field: this });
        const templateData = { imports: imports };
        const template = _.template(this.template, templateData);
        pageTitle = template();
      }
    }
    if (!_.isEmpty(pageTitle)) {
      this.fieldMap._rootComp.title.setTitle(pageTitle);
    }
  }
}

@Component({
  selector: 'page-title',
  template: `
  <!-- PageTitle Component placeholder. Nothing really to see here, move on. -->
  `,
})
export class PageTitleComponent extends SimpleComponent {
  field: PageTitle;

}
