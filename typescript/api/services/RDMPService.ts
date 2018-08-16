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

declare var sails: Sails;
declare var RecordType: Model;
declare var _this;
declare var User;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RDMPS extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'assignPermissions'
    ];

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
        editContributorObs.push(this.getObservable(User.findOne({email: editorEmail})));
      });
      _.each(viewContributorEmails, viewerEmail => {
        viewContributorObs.push(this.getObservable(User.findOne({email: viewerEmail})));
      });

      return Observable.zip(...editContributorObs)
      .flatMap(editContributorUsers => {
        let newEditList = [];
        this.filterPending(editContributorUsers, editContributorEmails, newEditList);
        record.authorization.edit = newEditList;
        record.authorization.editPending = editContributorEmails;
        return Observable.zip(...viewContributorObs);
      })
      .flatMap(viewContributorUsers => {
        let newviewList = [];
        this.filterPending(viewContributorUsers, editContributorEmails, newviewList);
        record.authorization.view = newviewList;
        record.authorization.viewPending = viewContributorEmails;
        return Observable.of(record);
      });
    }

  }
}
module.exports = new Services.RDMPS().exports();
