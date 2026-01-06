"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordWLDef = exports.RecordClass = void 0;
require("reflect-metadata");
const redbox_core_types_1 = require("@researchdatabox/redbox-core-types");
let RecordClass = class RecordClass {
};
exports.RecordClass = RecordClass;
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], RecordClass.prototype, "redboxOid", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], RecordClass.prototype, "harvestId", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "metaMetadata", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "metadata", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "workflow", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "authorization", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], RecordClass.prototype, "dateCreated", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string', autoUpdatedAt: true }),
    __metadata("design:type", String)
], RecordClass.prototype, "lastSaveDate", void 0);
exports.RecordClass = RecordClass = __decorate([
    (0, redbox_core_types_1.Entity)('record', {
        datastore: 'redboxStorage',
        autoCreatedAt: false,
        autoUpdatedAt: false,
    })
], RecordClass);
exports.RecordWLDef = (0, redbox_core_types_1.toWaterlineModelDef)(RecordClass);
