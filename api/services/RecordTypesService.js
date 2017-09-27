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
var Rx_1 = require("rxjs/Rx");
var services = require("../../typescript/services/CoreService.js");
var Services;
(function (Services) {
    var RecordTypes = (function (_super) {
        __extends(RecordTypes, _super);
        function RecordTypes() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this._exportedMethods = [
                'bootstrap',
                'create',
                'get'
            ];
            _this.bootstrap = function (defBrand) {
                return _super.prototype.getObservable.call(_this, RecordType.find({ branding: defBrand.id })).flatMap(function (recordTypes) {
                    if (_.isEmpty(recordTypes)) {
                        var rTypes = [];
                        sails.log.verbose("Bootstrapping record type definitions... ");
                        _.forOwn(sails.config.recordtype, function (config, recordType) {
                            recordTypes.push(recordType);
                            var obs = _this.create(defBrand, recordType);
                            rTypes.push(obs);
                        });
                        sails.log.verbose("RTypes");
                        return Rx_1.Observable.from(rTypes);
                    }
                    else {
                        sails.log.error("recordTypes");
                        sails.log.error(recordTypes);
                        var rTypes = [];
                        _.each(recordTypes, function (recordType) {
                            rTypes.push(Rx_1.Observable.of(recordType));
                        });
                        sails.log.verbose("Default recordTypes definition(s) exist.");
                        return Rx_1.Observable.from(rTypes);
                    }
                })
                    .last();
            };
            return _this;
        }
        RecordTypes.prototype.create = function (brand, name) {
            return _super.prototype.getObservable.call(this, RecordType.create({
                name: name,
                branding: brand.id
            }));
        };
        RecordTypes.prototype.get = function (brand, name) {
            return _super.prototype.getObservable.call(this, RecordType.findOne({ branding: brand.id, name: name }));
        };
        return RecordTypes;
    }(services.Services.Core.Service));
    Services.RecordTypes = RecordTypes;
})(Services = exports.Services || (exports.Services = {}));
module.exports = new Services.RecordTypes().exports();
