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


    public assignPermissions(oid, record, options) {
      const emailProperty = _.get(options, "emailProperty", "email");
      const editContributorProperties = _.get(options, "editContributorProperties", []);

      let authorization = _.get(record, "authorization", {});


      let editContributorObs = [];
      let editContributorEmails = [];
      let viewContributorEmails = [];
      _.each(editContributorProperties, editContributorProperty => {
        let editContributor = _.get(record, editContributorProperty, {});


        if (_.isArray(editContributor)) {
          sails.log.verbose(`Edit contributor array`);
          sails.log.verbose(editContributor);
          _.each(editContributor, contributor => {

            let editContributorEmailAddress = _.get(contributor, emailProperty, null);
            var queryObject = {};
            queryObject["email"] = editContributorEmailAddress;
            let obs = this.getObservable(User.findOne(queryObject));
            editContributorObs.push(obs);
            if (editContributorEmailAddress != null) {
              sails.log.verbose(`Pushing email address ${editContributorEmailAddress}`)
              editContributorEmails.push(editContributorEmailAddress);
            }
          });
        } else {
          sails.log.verbose(`Edit contributor`);
          sails.log.verbose(editContributor);
          let editContributorEmailAddress = _.get(editContributor, emailProperty, null);

          var queryObject = {};
          queryObject["email"] = editContributorEmailAddress;
          let obs = this.getObservable(User.findOne(queryObject));
          editContributorObs.push(obs);
          if (editContributorEmailAddress != null) {
            editContributorEmails.push(editContributorEmailAddress);
            sails.log.verbose(`Pushing email address ${editContributorEmailAddress}`);
          }
        }


      });
      return Observable.zip(...editContributorObs).map(editContributorUsers => {
        let newEditList = [];

        _.each(editContributorUsers, editContributorUser => {
          if (editContributorUser != null) {
            _.remove(editContributorEmails, editContributorEmail => {
              return editContributorEmail == editContributorUser['email'];
            });
            newEditList.push(editContributorUser['username']);
          }
        });

        record.authorization.edit = newEditList;

        record.authorization.editPending = editContributorEmails;

        return record;
      }).map(record => {
        const emailProperty = _.get(options, "emailProperty", "email");
        const viewContributorProperties = _.get(options, "viewContributorProperties", []);

        let viewContributorObs = [];
        //need the record for the next map so we'll put it in first.
        viewContributorObs.push(Observable.of(record));
        _.each(viewContributorProperties, viewContributorProperty => {
          let viewContributor = _.get(record, viewContributorProperty, {});


          if (_.isArray(viewContributor)) {
            _.each(viewContributor, contributor => {
              let viewContributorEmailAddress = _.get(contributor, emailProperty, null);
              var queryObject = {};
              queryObject["email"] = viewContributorEmailAddress;
              let obs = this.getObservable(User.findOne(queryObject));
              viewContributorObs.push(obs);
              if (viewContributorEmailAddress != null) {
                viewContributorEmails.push(viewContributorEmailAddress);
              }
            });
          } else {
            let viewContributorEmailAddress = _.get(viewContributor, emailProperty, null);
            var queryObject = {};
            queryObject["email"] = viewContributorEmailAddress;
            let obs = this.getObservable(User.findOne(queryObject));
            viewContributorObs.push(obs);
            if (viewContributorEmailAddress != null) {
              viewContributorEmails.push(viewContributorEmailAddress);
            }
          }


        });
        return Observable.zip(...viewContributorObs);
      }).flatMap(viewContributorUsers => {
        return viewContributorUsers;}).flatMap(viewContributorUsers => {
        let record = viewContributorUsers[0];
        viewContributorUsers = _.slice(viewContributorUsers, 1);
        let newviewList = [];
        _.each(viewContributorUsers, viewContributorUser => {
          if(viewContributorUser != null) {
          _.remove(viewContributorEmails, viewContributorEmail => {
            return viewContributorEmail == viewContributorUser['email'];
          });
          newviewList.push(viewContributorUser['username']);
        }});

        record.authorization.view = newviewList;
        record.authorization.viewPending = viewContributorEmails;

        return Observable.of(record);
      });
    }

  }
}
module.exports = new Services.RDMPS().exports();
