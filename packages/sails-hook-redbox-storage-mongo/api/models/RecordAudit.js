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
exports.RecordAuditWLDef = exports.RecordAuditClass = void 0;
require("reflect-metadata");
const redbox_core_types_1 = require("@researchdatabox/redbox-core-types");
let RecordAuditClass = class RecordAuditClass {
};
exports.RecordAuditClass = RecordAuditClass;
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordAuditClass.prototype, "user", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordAuditClass.prototype, "record", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], RecordAuditClass.prototype, "dateCreated", void 0);
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], RecordAuditClass.prototype, "action", void 0);
exports.RecordAuditClass = RecordAuditClass = __decorate([
    (0, redbox_core_types_1.Entity)('recordaudit', { datastore: 'redboxStorage' })
], RecordAuditClass);
exports.RecordAuditWLDef = (0, redbox_core_types_1.toWaterlineModelDef)(RecordAuditClass);
