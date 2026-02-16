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
    redboxOid;
    user;
    record;
    dateCreated;
    action;
};
exports.RecordAuditClass = RecordAuditClass;
__decorate([
    (0, redbox_core_types_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], RecordAuditClass.prototype, "redboxOid", void 0);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkQXVkaXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L2FwaS9tb2RlbHMvUmVjb3JkQXVkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEsNEJBQTBCO0FBQzFCLDBFQUF1RjtBQUdoRixJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQUVsQixTQUFTLENBQVU7SUFHbkIsSUFBSSxDQUEyQjtJQUcvQixNQUFNLENBQTJCO0lBR2pDLFdBQVcsQ0FBVTtJQUdyQixNQUFNLENBQVU7Q0FDMUIsQ0FBQTtBQWZZLDRDQUFnQjtBQUVsQjtJQUROLElBQUEsd0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7bURBQ0M7QUFHbkI7SUFETixJQUFBLHdCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzhDQUNlO0FBRy9CO0lBRE4sSUFBQSx3QkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOztnREFDaUI7QUFHakM7SUFETixJQUFBLHdCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7cURBQ2xCO0FBR3JCO0lBRE4sSUFBQSx3QkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDOztnREFDRjsyQkFkZCxnQkFBZ0I7SUFENUIsSUFBQSwwQkFBTSxFQUFDLGFBQWEsRUFBRSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsQ0FBQztHQUN6QyxnQkFBZ0IsQ0FlNUI7QUFFRCx3REFBd0Q7QUFDM0MsUUFBQSxnQkFBZ0IsR0FBRyxJQUFBLHVDQUFtQixFQUFDLGdCQUFnQixDQUFDLENBQUMifQ==