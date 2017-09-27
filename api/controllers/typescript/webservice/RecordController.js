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
                'render',
                'create'
            ];
            return _this;
        }
        Record.prototype.bootstrap = function () {
        };
        Record.prototype.render = function (req, res) {
            return this.sendView(req, res, 'dashboard');
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
                    sails.log.error(recordTypeModel);
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
                            sails.log.error(workflowStep);
                            if (workflowStep.name == workflowStage) {
                                metaMetadata["form"] = workflowStep.config.form;
                            }
                        });
                        return res.json(request);
                    });
                });
            }
        };
        return Record;
    }(controller.Controllers.Core.Controller));
    Controllers.Record = Record;
})(Controllers = exports.Controllers || (exports.Controllers = {}));
module.exports = new Controllers.Record().exports();
