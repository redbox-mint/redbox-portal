"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var controller = require("../../../../typescript/controllers/CoreController.js");
var Controllers;
(function (Controllers) {
    var Record = (function (_super) {
        __extends(Record, _super);
        function Record() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this._exportedMethods = [
                'create',
                'updateMeta',
                'getMeta',
                'addUserEdit',
                'removeUserEdit',
                'addUserView',
                'removeUserView'
            ];
            return _this;
        }
        Record.prototype.bootstrap = function () {
        };
        Record.prototype.addUserEdit = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var oid = req.param('oid');
            RecordsService.getMeta(oid).subscribe(function (record) {
                var body = req.body;
                var username = body["username"];
                if (username == null) {
                    record["authorization"]["edit"].push(username);
                }
                else {
                    var pendingUser = body["pendingUser"];
                    record["authorization"]["editPending"].push(pendingUser);
                }
                var obs = RecordsService.updateMeta(brand, oid, record);
                obs.subscribe(function (result) {
                    return res.json(result);
                });
            });
        };
        Record.prototype.addUserView = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var oid = req.param('oid');
            RecordsService.getMeta(oid).subscribe(function (record) {
                var body = req.body;
                var username = body["username"];
                if (username == null) {
                    record["authorization"]["view"].push(username);
                }
                else {
                    var pendingUser = body["pendingUser"];
                    record["authorization"]["viewPending"].push(pendingUser);
                }
                var obs = RecordsService.updateMeta(brand, oid, record);
                obs.subscribe(function (result) {
                    return res.json(result);
                });
            });
        };
        Record.prototype.removeUserEdit = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var oid = req.param('oid');
            RecordsService.getMeta(oid).subscribe(function (record) {
                var body = req.body;
                var username = body["username"];
                if (username == null) {
                    var userIndex = record["authorization"]["edit"].indexOf(username);
                    if (userIndex > -1) {
                        record["authorization"]["edit"].splice(userIndex, 1);
                    }
                }
                else {
                    var pendingUser = body["pendingUser"];
                    var userIndex = record["authorization"]["editPending"].indexOf(username);
                    if (userIndex > -1) {
                        record["authorization"]["editPending"].splice(userIndex, 1);
                    }
                }
                var obs = RecordsService.updateMeta(brand, oid, record);
                obs.subscribe(function (result) {
                    return res.json(result);
                });
            });
        };
        Record.prototype.removeUserView = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var oid = req.param('oid');
            RecordsService.getMeta(oid).subscribe(function (record) {
                var body = req.body;
                var username = body["username"];
                if (username == null) {
                    var userIndex = record["authorization"]["view"].indexOf(username);
                    if (userIndex > -1) {
                        record["authorization"]["view"].splice(userIndex, 1);
                    }
                }
                else {
                    var pendingUser = body["pendingUser"];
                    var userIndex = record["authorization"]["viewPending"].indexOf(username);
                    if (userIndex > -1) {
                        record["authorization"]["viewPending"].splice(userIndex, 1);
                    }
                }
                var obs = RecordsService.updateMeta(brand, oid, record);
                obs.subscribe(function (result) {
                    return res.json(result);
                });
            });
        };
        Record.prototype.getMeta = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var oid = req.param('oid');
            RecordsService.getMeta(oid).subscribe(function (record) {
                return res.json(record["metadata"]);
            });
        };
        Record.prototype.updateMeta = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var oid = req.param('oid');
            RecordsService.getMeta(oid).subscribe(function (record) {
                record["metadata"] = req.body;
                var obs = RecordsService.updateMeta(brand, oid, record);
                obs.subscribe(function (result) {
                    return res.json(result);
                });
            });
        };
        Record.prototype.create = function (req, res) {
            var brand = BrandingService.getBrand(req.session.branding);
            var recordType = req.param('recordType');
            var body = req.body;
            if (body != null) {
                var authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
                if (body["authorization"] != null) {
                    authorizationEdit = body["authorization"]["edit"];
                    authorizationView = body["authorization"]["view"];
                    authorizationEditPending = body["authorization"]["editPending"];
                    authorizationViewPending = body["authorization"]["editPending"];
                }
                else {
                    return res.status(400).json({ "message": "Request body requires an authorization block" });
                }
                var recordTypeObservable = RecordTypesService.get(brand, recordType);
                recordTypeObservable.subscribe(function (recordTypeModel) {
                    var metadata = body["metadata"];
                    var workflowStage = body["workflowStage"];
                    var request = {};
                    var metaMetadata = {};
                    metaMetadata["brandId"] = brand.id;
                    metaMetadata["type"] = recordTypeModel.name;
                    metaMetadata["createdBy"] = "admin";
                    request["metaMetadata"] = metaMetadata;
                    request["metadata"] = body["metadata"];
                    var workflowStepsObs = WorkflowStepsService.getAllForRecordType(recordTypeModel);
                    workflowStepsObs.subscribe(function (workflowSteps) {
                        _.each(workflowSteps, function (workflowStep) {
                            if (workflowStep["name"] == workflowStage) {
                                request["workflow"] = workflowStep["config"]["workflow"];
                                request["authorization"] = workflowStep["config"]["authorization"];
                                request["authorization"]["view"] = body["authorization"]["view"];
                                request["authorization"]["edit"] = body["authorization"]["edit"];
                                request["authorization"]["viewPending"] = body["authorization"]["viewPending"];
                                request["authorization"]["editPending"] = body["authorization"]["editPending"];
                                metaMetadata["form"] = workflowStep["config"]["form"];
                            }
                        });
                        var obs = RecordsService.create(brand, request);
                        obs.subscribe(function (result) {
                            return res.json(result);
                        });
                    });
                });
            }
        };
        return Record;
    }(controller.Controllers.Core.Controller));
    Controllers.Record = Record;
})(Controllers = exports.Controllers || (exports.Controllers = {}));
module.exports = new Controllers.Record().exports();
