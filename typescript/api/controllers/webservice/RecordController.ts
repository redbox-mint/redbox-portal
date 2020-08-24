// Copyright(c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

declare var BrandingService;
declare var RolesService;
declare var DashboardService;
declare var UsersService;
declare var FormsService;
declare var RecordTypesService;
declare var WorkflowStepsService;
declare var RecordsService;
declare var _;
declare var User;
/**
 * Package that contains all Controllers.
 */
import {Observable} from 'rxjs/Rx';
import * as path from "path";
import controller = require('../../core/CoreController.js');

const UUIDGenerator = require('uuid/v4');
export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Record extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'create',
      'updateMeta',
      'updateObjectMeta',
      'getMeta',
      'getObjectMeta',
      'addUserEdit',
      'removeUserEdit',
      'addUserView',
      'removeUserView',
      'getPermissions',
      'getDataStream',
      'addDataStreams',
      'listRecords'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public getPermissions(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        return res.json(record["authorization"]);
      });

    }

    public addUserEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');
      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      RecordsService.getMeta(oid).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["edit"] = _.union(record["authorization"]["edit"], users);

        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["editPending"] = _.union(record["authorization"]["editPending"], pendingUsers);
        }

        var obs = RecordsService.updateMeta(brand, oid, record,req.user);
        obs.subscribe(result => {
          if (result["code"] == 200) {
            RecordsService.getMeta(result["oid"]).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        }, error=> {
          sails.log.error(error);
          return this.apiFail(req, res, 500, 'Failed adding an editor, check server logs.');
        });
      });
    }

    public addUserView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');
      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      RecordsService.getMeta(oid).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["view"] = _.union(record["authorization"]["view"], users);

        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["viewPending"] = _.union(record["authorization"]["viewPending"], pendingUsers);
        }

        var obs = RecordsService.updateMeta(brand, oid, record, req.user);
        obs.subscribe(result => {
          if (result["code"] == 200) {
            RecordsService.getMeta(result["oid"]).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }

    public removeUserEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      RecordsService.getMeta(oid).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["edit"] = _.difference(record["authorization"]["edit"], users);
        }

        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["editPending"] = _.difference(record["authorization"]["editPending"], pendingUsers);
        }

        var obs = RecordsService.updateMeta(brand, oid, record,req.user);
        obs.subscribe(result => {
          if (result["code"] == 200) {
            RecordsService.getMeta(result["oid"]).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }

    public removeUserView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      RecordsService.getMeta(oid).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["view"] = _.difference(record["authorization"]["view"], users);
        }

        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["viewPending"] = _.difference(record["authorization"]["viewPending"], pendingUsers);
        }

        var obs = RecordsService.updateMeta(brand, oid, record, req.user);
        obs.subscribe(result => {
          if (result["code"] == 200) {
            RecordsService.getMeta(result["oid"]).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }


    public getMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        if (_.isEmpty(record)) {
          return Observable.throw(new Error(`Failed to get meta, cannot find existing record with oid: ${oid}`));
        }
        return res.json(record["metadata"]);
      },
      error=> {
        sails.log.error("Get metadata failed, failed to retrieve existing record.", error);
        return this.apiFail(req, res, 500, "Get Metadata failed, failed to retrieve existing record. ");
      });
    }

    public getObjectMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      sails.log.debug('brand is...');
      sails.log.debug(brand);
      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        return res.json(record["metaMetadata"]);
      });
    }

    public updateMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');
      const shouldMerge = req.param('merge', false);

      RecordsService.getMeta(oid).subscribe(record => {
        if (_.isEmpty(record)) {
          return Observable.throw(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        if (shouldMerge) {
          // behavior modified from replacing arrays to appending to arrays:
          record["metadata"] = _.mergeWith(record.metadata, req.body, (objValue, srcValue) => {
            if (_.isArray(objValue)) {
              return objValue.concat(srcValue);
            }
          });
        } else {
          record["metadata"] = req.body;
        }
        var obs = RecordsService.updateMeta(brand, oid, record, req.user);
        obs.subscribe(result => {
          return res.json(result);
        }, error=> {
          sails.log.error("Update metadata failed", error);
          return this.apiFail(req, res, 500, "Update Metadata failed");
        });
      },
      error=> {
        sails.log.error("Update metadata failed, failed to retrieve existing record.", error);
        return this.apiFail(req, res, 500, "Update Metadata failed, failed to retrieve existing record. ");
      });
    }

    public updateObjectMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        record["metaMetadata"] = req.body;
        var obs = RecordsService.updateMeta(brand, oid, record, req.user);
        obs.subscribe(result => {
          return res.json(result);
        });

      });
    }

    public create(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var recordType = req.param('recordType');

      var body = req.body;
      if (body != null) {
        var authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
        if (body["authorization"] != null) {
          authorizationEdit = body["authorization"]["edit"];
          authorizationView = body["authorization"]["view"];
          authorizationEditPending = body["authorization"]["editPending"];
          authorizationViewPending = body["authorization"]["viewPending"];
        } else {
          // If no authorization block set to user
          body["authorization"] = [];
          authorizationEdit = [];
          authorizationView = [];
          authorizationEdit.push(req.user.username);
          authorizationView.push(req.user.username);
        }
        var recordTypeObservable = RecordTypesService.get(brand, recordType);

        recordTypeObservable.subscribe(recordTypeModel => {

          if (recordTypeModel) {
            var metadata = body["metadata"];
            var workflowStage = body["workflowStage"];
            var request = {};
            var metaMetadata = {};
            metaMetadata["brandId"] = brand.id;
            metaMetadata["type"] = recordTypeModel.name;
            metaMetadata["packageName"] = recordTypeModel.packageName;
            // Resolves #723: removed hardcoded value
            metaMetadata["createdBy"] = req.user.username;
            request["metaMetadata"] = metaMetadata;
            //if no metadata field, no authorization
            if (metadata == null) {
              request["metadata"] = body;
            } else {
              request["metadata"] = metadata;
            }

            // FormsService
            var workflowStepsObs = WorkflowStepsService.getAllForRecordType(recordTypeModel);

            workflowStepsObs.subscribe(workflowSteps => {
              _.each(workflowSteps, function(workflowStep) {
                // If no workflowStage set, find the starting step
                if (workflowStage == null) {
                  if (workflowStep["starting"] == true) {
                    request["workflow"] = workflowStep["config"]["workflow"];
                    request["authorization"] = workflowStep["config"]["authorization"];
                    request["authorization"]["view"] = authorizationView;
                    request["authorization"]["edit"] = authorizationEdit;
                    request["authorization"]["viewPending"] = authorizationViewPending;
                    request["authorization"]["editPending"] = authorizationEditPending;
                    metaMetadata["form"] = workflowStep["config"]["form"];
                  }
                } else {
                  if (workflowStep["name"] == workflowStage) {
                    request["workflow"] = workflowStep["config"]["workflow"];
                    request["authorization"] = workflowStep["config"]["authorization"];
                    request["authorization"]["view"] = authorizationView;
                    request["authorization"]["edit"] = authorizationEdit;
                    request["authorization"]["viewPending"] = authorizationViewPending;
                    request["authorization"]["editPending"] = authorizationEditPending;
                    metaMetadata["form"] = workflowStep["config"]["form"];
                  }
                }

              });

              var obs = Observable.fromPromise(RecordsService.create(brand, request, recordTypeModel));
              obs.subscribe(result => {
                if (result["code"] == "200") {
                  result["code"] = 201;
                  res.set('Location', sails.config.appUrl + BrandingService.getBrandAndPortalPath(req) + "/api/records/metadata/" + result["oid"]);
                }

                return res.status(201).json(result);
              }, error=> {
                sails.log.error("Create Record failed", error);
                return this.apiFail(req, res, 500, "Create failed");
              });
            });

          } else {
            return this.apiFail(req, res, 400, "Record Type provided is not valid");
          }
        }
        );
      }
    }

    public getDataStream(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      sails.log.info(`getDataStream ${oid} ${datastreamId}`);
      return RecordsService.getMeta(oid).flatMap(currentRec => {
            const fileName = req.param('fileName') ? req.param('fileName') : datastreamId;
            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', `attachment; filename="${fileName}"`);
            sails.log.info(`Returning datastream observable of ${oid}: ${fileName}, datastreamId: ${datastreamId}`);
            let datastreamServiceName = sails.config.record.datastreamService;
            if(datastreamServiceName == undefined) {
              datastreamServiceName = "recordsservice";
            }
            let datastreamService = sails.services[datastreamServiceName];
            return datastreamService.getDatastream(oid, datastreamId).flatMap((response) => {
              res.end(Buffer.from(response.body), 'binary');
              return Observable.of(oid);
            });
      }).subscribe(whatever => {
        // ignore...
          sails.log.verbose(`Done with updating streams and returning response...`);
      }, error => {
          return this.customErrorMessageHandlingOnUpstreamResult(error, res);
        }
      );
    }

    public addDataStreams(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');
      const self = this;
      req.file('attachmentFields').upload({
        dirname: `${sails.config.record.attachments.stageDir}`,
        maxBytes: 104857600,
        saveAs: function (__newFileStream, next) {
          sails.log.verbose('Generating files....');
          try {
            // const nextPath = path.join(UUIDGenerator(), path.basename(__newFileStream.filename));
            const nextPath = UUIDGenerator();
            return next(undefined, nextPath);
          } catch (error) {
            sails.log.error(error);
            return next(new Error('Could not determine an appropriate filename for uploaded filestream(s).'));
          }
        }
      }, function (error, UploadedFileMetadata) {
        if (error) {
          const errorMessage = `There was a problem adding datastream(s) to: ${sails.config.record.attachments.stageDir}.`;
          sails.log.error(errorMessage, error);
          return res.status(500).json({message: errorMessage});
        }
        sails.log.verbose(UploadedFileMetadata);
        sails.log.verbose('Succesfully uploaded all file metadata. Sending locations downstream....');
        const fileIds = _.map(UploadedFileMetadata, function (nextDescriptor) {
          return path.relative(sails.config.record.attachments.stageDir, nextDescriptor.fd);
        });
        sails.log.verbose('files to send upstream are:');
        sails.log.verbose(_.toString(fileIds));
        const defaultErrorMessage = 'Error sending datastreams upstream.';
        try {
          let datastreamServiceName = sails.config.record.datastreamService;
          if(datastreamServiceName == undefined) {
            datastreamServiceName = "recordsservice";
          }
          let datastreamService = sails.services[datastreamServiceName];

          const reqs = datastreamService.addDatastreams(oid, fileIds);
          return Observable.fromPromise(reqs)
            .subscribe(result => {
              sails.log.verbose(`Done with updating streams and returning response...`);
              if (_.get(result, 'value.error') || result instanceof Error) {
                const message = _.get(result, 'value.message') || _.get(result, 'value.error');
                return res.status(500).json({message: message.toString('UTF-8')});
              } else {
                sails.log.verbose("Presuming success...");
                _.merge(result, {fileIds: fileIds});
                return res.json({message: result});
              }
            }, error => {
              return self.customErrorMessageHandlingOnUpstreamResult(error, res);
            });
        } catch (error) {
          sails.log.error(defaultErrorMessage, error);
          return res.status(500).json({message: defaultErrorMessage});
        }
      });
    }

    protected customErrorMessageHandlingOnUpstreamResult(error, res) {
      const defaultErrorMessage = 'There was a problem with the upstream request.';
      let errorMessage;
      if (error.error) {
        errorMessage = _.isBuffer(error.error) ? error.error.toString('UTF-8') : error.error
        try {
          errorMessage = JSON.parse(errorMessage)
        } catch (error) {
          sails.log.verbose("Error message is not a json object. Keeping it as is.");
        }
        sails.log.error(defaultErrorMessage, errorMessage);
      } else {
        errorMessage = defaultErrorMessage;
        sails.log.error(defaultErrorMessage);
      }
      sails.log.verbose(error);
      res.set('Content-Type', 'application/json');
      _.unset(res, 'Content-Disposition');
      return res.status(error.statusCode || 500).json({message: errorMessage});
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */


     /* Ad-hoc methods for listing records via api
     * Using DashboardService for getRecords similar (copied from
     * DashboardController) to DashboardService
     * Can be used for building reports or SPAs for redbox
     * TODO: Refactor DashboardController to use this and move DashboardService.getRecords
     * to RecordsService
     */

     private getDocMetadata(doc) {
       var metadata = {};
       for(var key in doc){
         if(key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
           metadata[key] = doc[key];
         }
         if(key == 'authorization_editRoles') {
           metadata[key] = doc[key];
         }
       }
       return metadata;
     }

     protected getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly=undefined, packageType = undefined, sort=undefined) {
       const username = user.username;
       if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
         recordType = recordType.split(',');
       }
       if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
         packageType = packageType.split(',');
       }
       var response = DashboardService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort);

       return response.map(results => {

         var totalItems = results["response"]["numFound"];
         var startIndex = results["response"]["start"];
         var noItems = rows;
         var pageNumber = Math.floor((startIndex / noItems) + 1);

         var response = {};
         response["totalItems"] = totalItems;
         if(startIndex < totalItems) {
           response["currentPage"] = pageNumber;
         }

         var items = [];
         var docs = results["response"]["docs"];

         for (var i = 0; i < docs.length; i++) {
           var doc = docs[i];
           var item = {};
           item["oid"] = doc["redboxOid"];
           item["title"] = doc["metadata"]["title"];
           item["metadata"]= this.getDocMetadata(doc);
           item["dateCreated"] =  doc["date_object_created"][0];
           item["dateModified"] = doc["date_object_modified"][0];
           item["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles, doc);
           items.push(item);
         }
         response["noItems"] = items.length;
         response["items"] = items;
         return Observable.of(response);
       });
     }

     public listRecords(req, res) {
       //sails.log.debug('api-list-records');
       const brand = BrandingService.getBrand(req.session.branding);
       const editAccessOnly = req.query.editOnly;

       var roles = [];
       var username = "guest";
       let user = {};
       if (req.isAuthenticated()) {
         roles = req.user.roles;
         user = req.user;
         username = req.user.username;
       } else {
         // assign default role if needed...
         user = {username: username};
         roles = [];
         roles.push(RolesService.getDefUnathenticatedRole(brand));
       }
       const recordType = req.param('recordType');
       const workflowState = req.param('state');
       const start = req.param('start');
       const rows = req.param('rows');
       const packageType = req.param('packageType');
       const sort = req.param('sort');
       if(rows > parseInt(sails.config.api.max_requests)){
         var error = {
          "code": 400,
          "contactEmail": null,
          "description": "You have reached the maximum of request available; Max rows per request " + sails.config.api.max_requests,
          "homeRef": "/",
          "reasonPhrase": "Bad Request",
          "uri": "http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.4.1"
        };
        res.status(400);
        res.json(error);
       } else {
         // sails.log.debug(`getRecords: ${recordType} ${workflowState} ${start}`);
         // sails.log.debug(`${rows} ${packageType} ${sort}`);
         this.getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort).flatMap(results => {
             return results;
           }).subscribe(response => {
             res.json(response);
           }, error => {
             sails.log.error("Error:");
             sails.log.error(error);
             var err = error['error'];
             res.json(err);
           });
       }
     }
  }
}

module.exports = new Controllers.Record().exports();
