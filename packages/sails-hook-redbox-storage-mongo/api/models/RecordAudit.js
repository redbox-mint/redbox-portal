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
    user;
    record;
    dateCreated;
    action;
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
// Export the Waterline model definition for runtime use
exports.RecordAuditWLDef = (0, redbox_core_types_1.toWaterlineModelDef)(RecordAuditClass);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkQXVkaXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L2FwaS9tb2RlbHMvUmVjb3JkQXVkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEsNEJBQTBCO0FBQzFCLDBFQUF1RjtBQUdoRixJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQUVsQixJQUFJLENBQTJCO0lBRy9CLE1BQU0sQ0FBMkI7SUFHakMsV0FBVyxDQUFVO0lBR3JCLE1BQU0sQ0FBVTtDQUMxQixDQUFBO0FBWlksNENBQWdCO0FBRWxCO0lBRE4sSUFBQSx3QkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzs4Q0FDZTtBQUcvQjtJQUROLElBQUEsd0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7Z0RBQ2lCO0FBR2pDO0lBRE4sSUFBQSx3QkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUM7O3FEQUNsQjtBQUdyQjtJQUROLElBQUEsd0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7Z0RBQ0Y7MkJBWGQsZ0JBQWdCO0lBRDVCLElBQUEsMEJBQU0sRUFBQyxhQUFhLEVBQUUsRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLENBQUM7R0FDekMsZ0JBQWdCLENBWTVCO0FBRUQsd0RBQXdEO0FBQzNDLFFBQUEsZ0JBQWdCLEdBQUcsSUFBQSx1Q0FBbUIsRUFBQyxnQkFBZ0IsQ0FBQyxDQUFDIn0=