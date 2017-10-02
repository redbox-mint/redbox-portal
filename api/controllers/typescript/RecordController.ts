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

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
import { Observable } from 'rxjs/Rx';
import moment from 'moment-es6';
declare var FormsService, RecordsService, WorkflowStepsService, BrandingService, RecordTypesService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../../../typescript/controllers/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to a Record, includings Forms, etc.
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   */
  export class Record extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'edit',
      'getForm',
      'create',
      'update',
      'stepTo'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public edit(req, res) {
      const oid = req.param('oid') ? req.param('oid') : '';
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      return this.sendView(req, res, 'record/edit', { oid: oid, recordType: recordType });
    }

    protected hasEditAccess(brand, user, currentRec) {
      return RecordsService.hasEditAccess(brand, user, currentRec)
        .flatMap(hasEditAccess => {
          if (!hasEditAccess) {
            return Observable.throw(new Error(`User doesn't have access to this record.`));
          }
          return Observable.of(true);
        });
    }

    public getForm(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const name = req.param('name');
      const oid = req.param('oid');
      const editMode = req.query.edit == "true";

      let obs = null;
      if (_.isEmpty(oid)) {
        obs = FormsService.getForm(brand.id, name, editMode);
      } else {
        // defaults to retrive the form of the current workflow state...
        obs = RecordsService.getMeta(oid).flatMap(currentRec => {

          if (_.isEmpty(currentRec)) {
            return Observable.throw(new Error(`Error, empty metadata for OID: ${oid}`));
          }
          return this.hasEditAccess(brand, req.user, currentRec)
            .flatMap(hasEditAccess => {
              const formName = currentRec.metaMetadata.form;
              return FormsService.getFormByName(formName,editMode).flatMap(form => {
                if (_.isEmpty(form)) {
                  return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                }
                this.mergeFields(req, res, form.fields, currentRec.metadata);
                return Observable.of(form);
              });
            });
        });
      }
      obs.subscribe(form => {
        if (!_.isEmpty(form)) {
          this.ajaxOk(req, res, null, form);
        } else {
          this.ajaxFail(req, res, null, { message: `Failed to get form with name:${name}` });
        }
      }, error => {
        sails.log.error("Error getting form definition:");
        sails.log.error(error);
        let message = error.message;
        if (error.error && error.error.code == 500) {
          message = "Problems retrieving this record, are you sure it exists?"
        }
        this.ajaxFail(req, res, message);
      });

    }

    public create(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const record = { metaMetadata: {} };
      var recordType = 'rdmp';
      record.authorization = { view: [req.user.username], edit: [req.user.username] };
      record.metaMetadata.brandId = brand.id;
      record.metaMetadata.createdBy = req.user.username;
      //TODO: This is currently hardcoded
      record.metaMetadata.type = recordType;
      record.metadata = metadata;

      RecordTypesService.get(brand, recordType).subscribe(recordType => {

        WorkflowStepsService.getFirst(recordType)
          .subscribe(wfStep => {

            this.updateWorkflowStep(record, wfStep);
            RecordsService.create(brand, record).subscribe(response => {
              if (response && response.code == "200") {
                response.success = true;
                this.ajaxOk(req, res, null, response);
              } else {
                this.ajaxFail(req, res, null, response);
              }
          }, error => {
            return Observable.throw(`Failed to save record: ${error}`)
          });
          }, error => {
            this.ajaxFail(req, res, `Failed to save record: ${error}`);
          });
      });
    }

    public update(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');

      this.getRecord(oid).flatMap(currentRec => {
        return this.hasEditAccess(brand, req.user, currentRec)
          .flatMap(hasEditAccess => {
            currentRec.metadata = metadata;
            return this.updateMetadata(brand, oid, currentRec, req.user.username);
          });
      })
        .subscribe(response => {
          if (response && response.code == "200") {
            response.success = true;
            this.ajaxOk(req, res, null, response);
          } else {
            this.ajaxFail(req, res, null, response);
          }
        }, error => {
          sails.log.error("Error updating meta:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
    }

    protected updateWorkflowStep(currentRec, nextStep) {
      if (!_.isEmpty(nextStep)) {
        currentRec.workflow = nextStep.config.workflow;
        // TODO: validate data with form fields
        currentRec.metaMetadata.form = nextStep.config.form;
        // Check for JSON-LD config
        if (sails.config.jsonld.addJsonLdContext) {
          currentRec.metadata['@context'] = sails.config.jsonld.contexts[currentRec.metaMetadata.form];
        }
        // update authorizations based on workflow...
        currentRec.authorization.viewRoles = nextStep.config.authorization.viewRoles;
        currentRec.authorization.editRoles = nextStep.config.authorization.editRoles;
      }
    }

    protected getRecord(oid) {
      return RecordsService.getMeta(oid).flatMap(currentRec => {
        if (_.isEmpty(currentRec)) {
          return Observable.throw(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        return Observable.of(currentRec);
      });
    }

    protected updateMetadata(brand, oid, currentRec, username) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      currentRec.metaMetadata.lastSavedBy = username;
      currentRec.metaMetadata.lastSaveDate = moment().format();
      return RecordsService.updateMeta(brand, oid, currentRec);
    }

    public stepTo(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');

      return this.getRecord(oid).flatMap(currentRec => {
        return this.hasEditAccess(brand, req.user, currentRec)
          .flatMap(hasEditAccess => {
            return WorkflowStepsService.get(brand, targetStep)
              .flatMap(nextStep => {
                currentRec.metadata = metadata;
                sails.log.verbose("Current rec:");
                sails.log.verbose(currentRec);
                sails.log.verbose("Next step:");
                sails.log.verbose(nextStep);
                this.updateWorkflowStep(currentRec, nextStep);
                return this.updateMetadata(brand, oid, currentRec, req.user.username);
              });
          });
      })
        .subscribe(response => {
          if (response && response.code == "200") {
            response.success = true;
            this.ajaxOk(req, res, null, response);
          } else {
            this.ajaxFail(req, res, null, response);
          }
        }, error => {
          sails.log.error("Error updating meta:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
    }

    protected mergeFields(req, res, fields, metadata) {
      _.forEach(fields, field => {
        if (_.has(metadata, field.definition.name)) {
          field.definition.value = metadata[field.definition.name];
        }
        this.replaceCustomFields(req, res, field, metadata);
        if (field.definition.fields) {
          this.mergeFields(req, res, field.definition.fields, metadata);
        }
      });
    }

    protected replaceCustomFields(req, res, field, metadata) {
      _.forOwn(sails.config.record.customFields, (customConfig, customKey) => {
        if (!_.isEmpty(field.definition.value) && _.isString(field.definition.value) && field.definition.value.indexOf(customKey) != -1) {
          let replacement = null;
          if (customConfig.source == 'request') {
            switch (customConfig.type) {
              case 'session':
                replacement = req.session[customConfig.field];
                break;
              case 'param':
                replacement = req.param(customConfig.field);
                break;
            }
          }
          if (!_.isEmpty(replacement)) {
            field.definition.value = field.definition.value.replace(customKey, replacement);
          }
        }
      });
    }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Record().exports();
