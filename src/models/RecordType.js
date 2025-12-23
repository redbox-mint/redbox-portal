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
    dashboard;
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
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordType.prototype, "dashboard", void 0);
exports.RecordType = RecordType = __decorate([
    (0, decorators_1.BeforeCreate)(assignKey),
    (0, decorators_1.Entity)('recordtype')
], RecordType);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkVHlwZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9SZWNvcmRUeXBlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUFzRjtBQUV0RixNQUFNLFNBQVMsR0FBRyxDQUFDLFVBQStCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQy9FLFVBQVUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxVQUFVLENBQUMsUUFBUSxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM3RCxFQUFFLEVBQUUsQ0FBQztBQUNQLENBQUMsQ0FBQztBQUlLLElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVU7SUFFZCxHQUFHLENBQVU7SUFHYixJQUFJLENBQVU7SUFHZCxRQUFRLENBQW1CO0lBRzNCLFdBQVcsQ0FBVTtJQUdyQixVQUFVLENBQVU7SUFHcEIsYUFBYSxDQUFhO0lBRzFCLGFBQWEsQ0FBMkI7SUFHeEMsVUFBVSxDQUFXO0lBR3JCLHNCQUFzQixDQUEyQjtJQUdqRCxTQUFTLENBQTJCO0lBR3BDLEtBQUssQ0FBMkI7SUFHaEMsU0FBUyxDQUEyQjtDQUM1QyxDQUFBO0FBcENZLGdDQUFVO0FBRWQ7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7dUNBQ25CO0FBR2I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7d0NBQ3BCO0FBR2Q7SUFETixJQUFBLHNCQUFTLEVBQUMsZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7OzRDQUNkO0FBRzNCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDOzsrQ0FDRztBQUdyQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxDQUFDOzs4Q0FDckI7QUFHcEI7SUFETixJQUFBLG9CQUFPLEVBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQzs7aURBQ0w7QUFHMUI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7O2lEQUN3QjtBQUd4QztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDOzs4Q0FDaEI7QUFHckI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzBEQUNpQztBQUdqRDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7NkNBQ29CO0FBR3BDO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzt5Q0FDZ0I7QUFHaEM7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzZDQUNvQjtxQkFuQ2hDLFVBQVU7SUFGdEIsSUFBQSx5QkFBWSxFQUFDLFNBQVMsQ0FBQztJQUN2QixJQUFBLG1CQUFNLEVBQUMsWUFBWSxDQUFDO0dBQ1IsVUFBVSxDQW9DdEIifQ==