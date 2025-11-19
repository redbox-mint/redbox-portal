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
exports.RecordType = void 0;
const decorators_1 = require("../../lib/decorators");
const assignKey = (recordType, cb) => {
    recordType.key = `${recordType.branding}_${recordType.name}`;
    cb();
};
let RecordType = class RecordType {
    key;
    name;
    branding;
    packageType;
    searchCore;
    workflowSteps;
    searchFilters;
    searchable;
    transferResponsibility;
    relatedTo;
    hooks;
};
exports.RecordType = RecordType;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], RecordType.prototype, "key", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], RecordType.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], RecordType.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], RecordType.prototype, "packageType", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', defaultsTo: 'default' }),
    __metadata("design:type", String)
], RecordType.prototype, "searchCore", void 0);
__decorate([
    (0, decorators_1.HasMany)('workflowStep', 'recordType'),
    __metadata("design:type", Array)
], RecordType.prototype, "workflowSteps", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordType.prototype, "searchFilters", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean', defaultsTo: true }),
    __metadata("design:type", Boolean)
], RecordType.prototype, "searchable", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordType.prototype, "transferResponsibility", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordType.prototype, "relatedTo", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordType.prototype, "hooks", void 0);
exports.RecordType = RecordType = __decorate([
    (0, decorators_1.BeforeCreate)(assignKey),
    (0, decorators_1.Entity)('recordtype')
], RecordType);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkVHlwZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9SZWNvcmRUeXBlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUFzRjtBQUV0RixNQUFNLFNBQVMsR0FBRyxDQUFDLFVBQStCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQy9FLFVBQVUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxVQUFVLENBQUMsUUFBUSxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM3RCxFQUFFLEVBQUUsQ0FBQztBQUNQLENBQUMsQ0FBQztBQUlLLElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVU7SUFFZCxHQUFHLENBQVU7SUFHYixJQUFJLENBQVU7SUFHZCxRQUFRLENBQW1CO0lBRzNCLFdBQVcsQ0FBVTtJQUdyQixVQUFVLENBQVU7SUFHcEIsYUFBYSxDQUFhO0lBRzFCLGFBQWEsQ0FBMkI7SUFHeEMsVUFBVSxDQUFXO0lBR3JCLHNCQUFzQixDQUEyQjtJQUdqRCxTQUFTLENBQTJCO0lBR3BDLEtBQUssQ0FBMkI7Q0FDeEMsQ0FBQTtBQWpDWSxnQ0FBVTtBQUVkO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7O3VDQUNuQjtBQUdiO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O3dDQUNwQjtBQUdkO0lBRE4sSUFBQSxzQkFBUyxFQUFDLGdCQUFnQixFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs0Q0FDZDtBQUczQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7K0NBQ0c7QUFHckI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQzs7OENBQ3JCO0FBR3BCO0lBRE4sSUFBQSxvQkFBTyxFQUFDLGNBQWMsRUFBRSxZQUFZLENBQUM7O2lEQUNMO0FBRzFCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOztpREFDd0I7QUFHeEM7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7OENBQ2hCO0FBR3JCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzswREFDaUM7QUFHakQ7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzZDQUNvQjtBQUdwQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7eUNBQ2dCO3FCQWhDNUIsVUFBVTtJQUZ0QixJQUFBLHlCQUFZLEVBQUMsU0FBUyxDQUFDO0lBQ3ZCLElBQUEsbUJBQU0sRUFBQyxZQUFZLENBQUM7R0FDUixVQUFVLENBaUN0QiJ9