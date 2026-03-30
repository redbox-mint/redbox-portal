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
exports.DeletedRecordWLDef = exports.DeletedRecordClass = void 0;
require("reflect-metadata");
const redbox_core_1 = require("@researchdatabox/redbox-core");
let DeletedRecordClass = class DeletedRecordClass {
    redboxOid;
    deletedRecordMetadata;
    dateDeleted;
};
exports.DeletedRecordClass = DeletedRecordClass;
__decorate([
    (0, redbox_core_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], DeletedRecordClass.prototype, "redboxOid", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], DeletedRecordClass.prototype, "deletedRecordMetadata", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], DeletedRecordClass.prototype, "dateDeleted", void 0);
exports.DeletedRecordClass = DeletedRecordClass = __decorate([
    (0, redbox_core_1.Entity)('deletedrecord', { datastore: 'redboxStorage' })
], DeletedRecordClass);
// Export the Waterline model definition for runtime use
exports.DeletedRecordWLDef = (0, redbox_core_1.toWaterlineModelDef)(DeletedRecordClass);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVsZXRlZFJlY29yZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvYXBpL21vZGVscy9EZWxldGVkUmVjb3JkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLDRCQUEwQjtBQUMxQiw4REFBaUY7QUFHMUUsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBa0I7SUFFdEIsU0FBUyxDQUFVO0lBR25CLHFCQUFxQixDQUEyQjtJQUdoRCxXQUFXLENBQVU7Q0FDN0IsQ0FBQTtBQVRZLGdEQUFrQjtBQUV0QjtJQUROLElBQUEsa0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOztxREFDYjtBQUduQjtJQUROLElBQUEsa0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7aUVBQ2dDO0FBR2hEO0lBRE4sSUFBQSxrQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUM7O3VEQUNsQjs2QkFSakIsa0JBQWtCO0lBRDlCLElBQUEsb0JBQU0sRUFBQyxlQUFlLEVBQUUsRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLENBQUM7R0FDM0Msa0JBQWtCLENBUzlCO0FBRUQsd0RBQXdEO0FBQzNDLFFBQUEsa0JBQWtCLEdBQUcsSUFBQSxpQ0FBbUIsRUFBQyxrQkFBa0IsQ0FBQyxDQUFDIn0=