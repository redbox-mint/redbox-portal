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
import services = require('../core/CoreService.js');
import { Sails, Model } from "sails";
import moment from 'moment-es6';
import * as numeral from 'numeral';

declare var sails: Sails;
declare var RecordType, Counter: Model;
declare var _this;
declare var User;
declare var _;
declare var TranslationService;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RDMPS extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'assignPermissions',
      'processRecordCounters'
    ];

    /**
     * This is a trigger service method to bump all configured increment counters.
     *
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  oid
     * @param  record
     * @param  options
     *  expects:
     *  {
     *    "counters": [
     *       {
     *        "field_name": "<name of the field to increment in the record>"
     *        "strategy": "<strategy of the increment>",
     *                      possible values:
     *                      - "field": increase the previous value by one
     *                      - "global": increase the previous value of the global counter document identified by the record's brandingId and field_name
     *         "prefix": "<the language key entry to prefix the value>"
     *       }
     *    ]
     *  }
     * @param  user
     * @return
     */
    public processRecordCounters(oid, record, options, user) {
      const brandId = record.metaMetadata.brandId;
      const obs = [];
      // get the counters
      _.each(options.counters, (counter:any) => {
        if (counter.strategy == "global") {
          obs.push(this.getObservable(Counter.findOrCreate({name: counter.field_name, branding: brandId}, {name: counter.field_name, branding: brandId, value: 0})));
        } else if (counter.strategy == "field") {
          let srcVal = record.metadata[counter.field_name];
          if (!_.isEmpty(counter.source_field)) {
            srcVal = record.metadata[counter.source_field];
          }
          let newVal = _.isUndefined(srcVal) || _.isEmpty(srcVal) ? 1 : _.toNumber(srcVal)+1;
          this.incrementCounter(record, counter, newVal);
        }
      });
      if (_.isEmpty(obs)) {
        return Observable.of(record);
      } else {
        return Observable.zip(...obs)
        .flatMap(counterVals => {
          const updateObs = [];
          _.each(counterVals, (counterVal, idx) => {
            let counter = options.counters[idx];
            let newVal = counterVal[0].value + 1;
            this.incrementCounter(record, counter, newVal);
            updateObs.push(this.getObservable(Counter.updateOne({id: counterVal[0].id}, {value: newVal})));
          });
          return Observable.zip(...updateObs);
        })
        .flatMap(updateVals => {
          return Observable.of(record);
        });
      }
    }

    private incrementCounter(record:any, counter:any, newVal:any) {
      if (!_.isEmpty(counter.template)) {
        const imports = _.extend({moment: moment, numeral: numeral, newVal: newVal}, counter);
        const templateData = {imports: imports};
        const template = _.template(counter.template, templateData);
        newVal = template();
      }
      const recVal = `${TranslationService.t(counter.prefix)}${newVal}`;
      _.set(record.metadata, counter.field_name, recVal);
      if (!_.isEmpty(counter.add_value_to_array)) {
        const arrayVal = _.get(record, counter.add_value_to_array, []);
        arrayVal.push(recVal);
        _.set(record, counter.add_value_to_array, arrayVal);
      }
    }

    protected addEmailToList(contributor, emailProperty, emailList) {
      let editContributorEmailAddress = _.get(contributor, emailProperty, null);
      if (!editContributorEmailAddress) {
        if (!contributor) {
          return;
        }
        editContributorEmailAddress = contributor;
      }
      if (editContributorEmailAddress != null && !_.isEmpty(editContributorEmailAddress) && !_.isUndefined(editContributorEmailAddress) && _.isString(editContributorEmailAddress)) {
        sails.log.verbose(`Pushing contrib email address ${editContributorEmailAddress}`)
        emailList.push(editContributorEmailAddress);
      }
    }

    protected populateContribList(contribProperties, record, emailProperty, emailList) {
      _.each(contribProperties, editContributorProperty => {
        let editContributor = _.get(record, editContributorProperty, null);

        if (editContributor) {
          sails.log.verbose(`Contributor:`);
          sails.log.verbose(JSON.stringify(editContributor));
          if (_.isArray(editContributor)) {
            _.each(editContributor, contributor => {
              this.addEmailToList(contributor, emailProperty, emailList);
            });
          } else {
            this.addEmailToList(editContributor, emailProperty, emailList);
          }
        }
      });
      return _.uniq(emailList);
    }

    protected filterPending(users, userEmails, userList) {
      _.each(users, user => {
        if (user != null) {
          _.remove(userEmails, email => {
            return email == user['email'];
          });
          userList.push(user['username']);
        }
      });
    }


    public assignPermissions(oid, record, options) {
      sails.log.verbose(`Assign Permissions executing on oid: ${oid}, using options:`);
      sails.log.verbose(JSON.stringify(options));
      sails.log.verbose(`With record: `);
      sails.log.verbose(record);
      const emailProperty = _.get(options, "emailProperty", "email");
      const editContributorProperties = _.get(options, "editContributorProperties", []);
      const viewContributorProperties = _.get(options, "viewContributorProperties", []);
      const recordCreatorPermissions = _.get(options,"recordCreatorPermissions");
      let authorization = _.get(record, "authorization", {});
      let editContributorObs = [];
      let viewContributorObs = [];
      let editContributorEmails = [];
      let viewContributorEmails = [];

      // get the new editor list...
      editContributorEmails = this.populateContribList(editContributorProperties, record, emailProperty, editContributorEmails);
      // get the new viewer list...
      viewContributorEmails = this.populateContribList(viewContributorProperties, record, emailProperty, viewContributorEmails);


      if (_.isEmpty(editContributorEmails)) {
        sails.log.error(`No editors for record: ${oid}`);
      }
      if (_.isEmpty(viewContributorEmails)) {
        sails.log.error(`No viewers for record: ${oid}`);
      }
      _.each(editContributorEmails, editorEmail => {
        editContributorObs.push(this.getObservable(User.findOne({email: editorEmail.toLowerCase()l})));
      });
      _.each(viewContributorEmails, viewerEmail => {
        viewContributorObs.push(this.getObservable(User.findOne({email: viewerEmail.toLowerCase()})));
      });

      return Observable.zip(...editContributorObs)
      .flatMap(editContributorUsers => {
        let newEditList = [];
        this.filterPending(editContributorUsers, editContributorEmails, newEditList);
        if(recordCreatorPermissions == "edit" || recordCreatorPermissions == "view&edit") {
            newEditList.push(record.metaMetadata.createdBy);
        }
        record.authorization.edit = newEditList;
        record.authorization.editPending = editContributorEmails;
        return Observable.zip(...viewContributorObs);
      })
      .flatMap(viewContributorUsers => {
        let newviewList = [];
        this.filterPending(viewContributorUsers, editContributorEmails, newviewList);
        if(recordCreatorPermissions == "view" || recordCreatorPermissions == "view&edit") {
            newviewList.push(record.metaMetadata.createdBy);
        }
        record.authorization.view = newviewList;
        record.authorization.viewPending = viewContributorEmails;
        return Observable.of(record);
      });
    }

  }
}
module.exports = new Services.RDMPS().exports();
