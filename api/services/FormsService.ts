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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var Form: Model;
declare var _this;

export module Services {
  /**
   * Forms related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Forms extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'getForm',
      'flattenFields'
    ];

    public bootstrap = (defBrand): Observable<any> => {
      return super.getObservable(Form.find({branding:defBrand.id})).flatMap(form => {
        if (!form || form.length == 0) {
          sails.log.verbose("Bootstrapping form definitions... ");
          const formDefs = [];
          _.forOwn(sails.config.form.forms, (formDef, formName) => {
            formDefs.push(formName);
          });
          return Observable.from(formDefs);
        } else {
          sails.log.verbose("Form definition(s) exist.");
          return Observable.of(null);
        }
      })
      .flatMap(formName => {
        if (formName) {
          const formObj = {
            name: formName,
            fields: sails.config.form.forms[formName].fields,
            branding: defBrand.id,
            type: sails.config.form.forms[formName].type,
            messages: sails.config.form.forms[formName].messages,
            viewCssClasses: sails.config.form.forms[formName].viewCssClasses,
            editCssClasses: sails.config.form.forms[formName].editCssClasses,
            skipValidationOnSave: sails.config.form.forms[formName].skipValidationOnSave
          };
          return super.getObservable(Form.create(formObj));
        }
        return Observable.of(null);
      })
      .last();
    }

    public getForm = (name, brandId, editMode): Observable<any> => {
      return super.getObservable(Form.findOne({name: name, branding: brandId})).flatMap(form => {
        if (form) {
          this.setFormEditMode(form.fields, editMode);
        }
        return Observable.of(form);
      });
    }

    protected setFormEditMode(fields, editMode) {
      _.remove(fields, field => {
        if (editMode) {
          return field.viewOnly == true;
        } else {
          return field.editOnly == true;
        }
      });
      _.forEach(fields, field => {
        field.definition.editMode = editMode;
        if (!_.isEmpty(field.definition.fields)) {
          this.setFormEditMode(field.definition.fields, editMode);
        }
      });
    }

    public flattenFields(fields, fieldArr) {
      _.map(fields, (f)=> {
        fieldArr.push(f);
        if (f.fields) {
          this.flattenFields(f.fields, fieldArr);
        }
      });
    }
  }
}
module.exports = new Services.Forms().exports();
