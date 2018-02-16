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
declare var FormsService, RecordsService, WorkflowStepsService, BrandingService, RecordTypesService, TranslationService, User, EmailService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../../../typescript/controllers/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to a Record, includings Forms, etc.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
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
      'stepTo',
      'modifyEditors',
      'search',
      'getType',
      'getMeta',
      'getTransferResponsibilityConfig',
      'updateResponsibilities'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public getMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      var obs = RecordsService.getMeta(oid);
      return obs.subscribe(record => {
        this.hasViewAccess(brand, req.user, record).subscribe(hasViewAccess => {
          if (hasViewAccess) {
            return res.json(record.metadata);
          } else {
            return res.json({ status: "Access Denied" });
          }

        });
      });
    }

    public edit(req, res) {
      const oid = req.param('oid') ? req.param('oid') : '';
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      return this.sendView(req, res, 'record/edit', { oid: oid, recordType: recordType });
    }

    protected hasEditAccess(brand, user, currentRec) {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return Observable.of(RecordsService.hasEditAccess(brand, user, user.roles, currentRec));
    }

    protected hasViewAccess(brand, user, currentRec) {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return Observable.of(RecordsService.hasViewAccess(brand, user, user.roles, currentRec));
    }

    public getTransferResponsibilityConfig(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var type = req.param('type');
      var recordTypeConfig = sails.config.recordtype;

      return res.json(this.getTransferResponsibilityConfigObject(recordTypeConfig, type))


    }

    private getTransferResponsibilityConfigObject(config, type) {
      for(var key in config) {
        if(config[key]["packageType"] == type) {
          return config[key]["transferResponsibility"];
        }
      }
      return {};
    }

    public updateResponsibilities(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const records = req.body.records;
      var role = req.body.role;
      var toEmail = req.body.email;
      var toName = req.body.name;
      sails.log.error("In update responsibilities");
      sails.log.error(req);
      let recordCtr = 0;
      if (records.length > 0) {
        _.forEach(records, rec => {
          const oid = rec.oid;
          this.getRecord(oid).subscribe(record => {
            //TODO: hardcoded to RDMP for the time being
            var transferConfig = this.getTransferResponsibilityConfigObject(sails.config.recordtype,'rdmp');

            var nameField = transferConfig.fields[role].fieldNames.name;
            var emailField = transferConfig.fields[role].fieldNames.email;
            sails.log.error("name field"+nameField)
            sails.log.error("name"+toName)
            sails.log.error("email field"+emailField)
            sails.log.error("email"+toEmail)
            _.set(record, "metadata."+nameField, toName);
            _.set(record, "metadata."+emailField, toEmail);
            sails.log.error(record)
            RecordsService.updateMeta(brand, oid, record).subscribe(response => {
              if (response && response.code == "200") {
                recordCtr++;

                var to = toEmail;
                var subject = "Ownership transfered";
                var data = {};
                data['record'] = record;
                data['name'] = toName;
                data['oid'] = toName;
                EmailService.sendTemplate(to, subject, "transferOwnerTo", data);
                if (recordCtr == records.length) {
                  response.success = true;
                  this.ajaxOk(req, res, null, response);
                }
              } else {
                sails.log.error(`Failed to update authorization:`);
                sails.log.error(response);
                this.ajaxFail(req, res, TranslationService.t('auth-update-error'));
              }
            }, error => {
              sails.log.error("Error updating auth:");
              sails.log.error(error);
              this.ajaxFail(req, res, error.message);
            });

          });
        });
      } else {
        this.ajaxFail(req, res, 'No records specified');
      }
    }


    public getForm(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const name = req.param('name');
      const oid = req.param('oid');
      const editMode = req.query.edit == "true";

      let obs = null;
      if (_.isEmpty(oid)) {
        obs = FormsService.getForm(brand.id, name, editMode).flatMap(form =>{
          this.mergeFields(req, res, form.fields, {});
          return Observable.of(form);
        });
      } else {
        // defaults to retrive the form of the current workflow state...
        obs = RecordsService.getMeta(oid).flatMap(currentRec => {
          if (_.isEmpty(currentRec)) {
            return Observable.throw(new Error(`Error, empty metadata for OID: ${oid}`));
          }
          if(editMode) {
          return this.hasEditAccess(brand, req.user, currentRec)
            .flatMap(hasEditAccess => {
              if(!hasEditAccess) {
                return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
              }
              const formName = currentRec.metaMetadata.form;
              return FormsService.getFormByName(formName, editMode).flatMap(form => {
                if (_.isEmpty(form)) {
                  return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                }
                this.mergeFields(req, res, form.fields, currentRec.metadata);
                return Observable.of(form);
              });
            });
          } else {
            return this.hasViewAccess(brand, req.user, currentRec)
              .flatMap(hasViewAccess => {
                if(!hasViewAccess) {
                  return Observable.throw(new Error(TranslationService.t('view-error-no-permissions')));
                }
                const formName = currentRec.metaMetadata.form;
                return FormsService.getFormByName(formName, editMode).flatMap(form => {
                  if (_.isEmpty(form)) {
                    return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                  }
                  this.mergeFields(req, res, form.fields, currentRec.metadata);
                  return Observable.of(form);
                });
              });
          }
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
          message = TranslationService.t('missing-record');
        }
        this.ajaxFail(req, res, message);
      });

    }

    public create(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const record = { metaMetadata: {} };
      var recordType = req.param('recordType');
      record.authorization = { view: [req.user.username], edit: [req.user.username] };
      record.metaMetadata.brandId = brand.id;
      record.metaMetadata.createdBy = req.user.username;
      //TODO: This is currently hardcoded
      record.metaMetadata.type = recordType;
      record.metadata = metadata;

      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        let packageType = recordType.packageType;
        WorkflowStepsService.getFirst(recordType)
          .subscribe(wfStep => {

            this.updateWorkflowStep(record, wfStep);
            RecordsService.create(brand, record, packageType).subscribe(response => {
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
      const user = req.user;
      this.getRecord(oid).subscribe(currentRec => {
        sails.log.verbose(`Got record:`);
        sails.log.verbose(currentRec);
        sails.log.verbose(`Updating to:`);
        sails.log.verbose(metadata);
        this.saveMetadata(brand, oid, currentRec, metadata, user).subscribe(response => {
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
      });
    }

    protected saveMetadata(brand, oid, currentRec, metadata, user): Observable<any> {
      return this.hasEditAccess(brand, user, currentRec)
        .flatMap(hasEditAccess => {
          currentRec.metadata = metadata;
          return this.updateMetadata(brand, oid, currentRec, user.username);
        });
    }

    protected saveAuthorization(brand, oid, currentRec, authorization, user): Observable<any> {
      return this.hasEditAccess(brand, user, currentRec)
        .flatMap(hasEditAccess => {
          currentRec.authorization = authorization;
          return this.updateAuthorization(brand, oid, currentRec, user.username);
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
      sails.log.verbose(`Calling record service...`);
      sails.log.verbose(currentRec);
      return RecordsService.updateMeta(brand, oid, currentRec);
    }

    protected updateAuthorization(brand, oid, currentRec, username) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
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
      let variableSubstitutionFields = field.variableSubstitutionFields;
      if (!_.isEmpty(variableSubstitutionFields)) {
        _.forEach(variableSubstitutionFields, fieldName => {
          _.forOwn(sails.config.record.customFields, (customConfig, customKey) => {
            if (!_.isEmpty(field.definition[fieldName]) && _.isString(field.definition[fieldName]) && field.definition[fieldName].indexOf(customKey) != -1) {
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
                field.definition[fieldName]= field.definition[fieldName].replace(customKey, replacement);
              }
            }
          });
        });
      }
    }

    public modifyEditors(req, res) {
      const records = req.body.records;
      var toUsername = req.body.username;
      var toEmail = req.body.email;
      //TODO: Add email to username lookup
      const fromUsername = req.user.username;
      const brand = BrandingService.getBrand(req.session.branding);
      const user = req.user;

      let recordCtr = 0;
      if (records.length > 0) {
        _.forEach(records, rec => {
          const oid = rec.oid;
          this.getRecord(oid).subscribe(record => {
            const authorization = _.cloneDeep(record.authorization);
            // current user will lose edit access but will keep read-only access
            _.remove(authorization.edit, (username) => {
              return username == fromUsername;
            });
            if (_.isUndefined(_.find(authorization.view, (username) => { return username == fromUsername }))) {
              authorization.view.push(fromUsername);
            }
            if(!_.isEmpty(toUsername)) {
              if (_.isUndefined(_.find(authorization.edit, (username) => { return username == toUsername }))) {
                authorization.edit.push(toUsername);
              }
            } else {
              if (_.isUndefined(_.find(authorization.editPending, (email) => { return toEmail == email }))) {
                if(_.isUndefined(authorization.editPending)) {
                  authorization.editPending = [];
                }
                authorization.editPending.push(toEmail);
              }
            }

            this.saveAuthorization(brand, oid, record, authorization, user).subscribe(response => {
              if (response && response.code == "200") {
                recordCtr++;
                if (recordCtr == records.length) {
                  response.success = true;
                  this.ajaxOk(req, res, null, response);
                }
              } else {
                sails.log.error(`Failed to update authorization:`);
                sails.log.error(response);
                this.ajaxFail(req, res, TranslationService.t('auth-update-error'));
              }
            }, error => {
              sails.log.error("Error updating auth:");
              sails.log.error(error);
              this.ajaxFail(req, res, error.message);
            });
          });
        });
      } else {
        this.ajaxFail(req, res, 'No records specified');
      }
    }

    public search(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const type = req.param('type');
      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;
      const exactSearchNames = _.isEmpty(req.query.exactNames) ? [] : req.query.exactNames.split(',');
      const exactSearches = [];
      const facetSearchNames = _.isEmpty(req.query.facetNames) ? [] : req.query.facetNames.split(',');
      const facetSearches = [];

      _.forEach(exactSearchNames, (exactSearch) => {
        exactSearches.push({ name: exactSearch, value: req.query[`exact_${exactSearch}`] });
      });
      _.forEach(facetSearchNames, (facetSearch) => {
        facetSearches.push({ name: facetSearch, value: req.query[`facet_${facetSearch}`] });
      });


      RecordsService.searchFuzzy(type, workflow, searchString, exactSearches, facetSearches, brand, req.user, req.user.roles, sails.config.record.search.returnFields)
        .subscribe(searchRes => {
          this.ajaxOk(req, res, null, searchRes);
        }, error => {
          this.ajaxFail(req, res, error.message);
        });
    }
    /** Returns the RecordType configuration */
    public getType(req, res) {
      const recordType = req.param('recordType');
      const brand = BrandingService.getBrand(req.session.branding);
      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        this.ajaxOk(req, res, null, recordType);
      }, error => {
        this.ajaxFail(req, res, error.message);
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
