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
exports.DeletedRecord = void 0;
const decorators_1 = require("../../lib/decorators");
let DeletedRecord = class DeletedRecord {
    redboxOid;
    deletedRecordMetadata;
    dateDeleted;
};
exports.DeletedRecord = DeletedRecord;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], DeletedRecord.prototype, "redboxOid", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], DeletedRecord.prototype, "deletedRecordMetadata", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], DeletedRecord.prototype, "dateDeleted", void 0);
exports.DeletedRecord = DeletedRecord = __decorate([
    (0, decorators_1.Entity)('deletedrecord', { datastore: 'redboxStorage' })
], DeletedRecord);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVsZXRlZFJlY29yZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9EZWxldGVkUmVjb3JkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUFvRDtBQUc3QyxJQUFNLGFBQWEsR0FBbkIsTUFBTSxhQUFhO0lBRWpCLFNBQVMsQ0FBVTtJQUduQixxQkFBcUIsQ0FBMkI7SUFHaEQsV0FBVyxDQUFVO0NBQzdCLENBQUE7QUFUWSxzQ0FBYTtBQUVqQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOztnREFDYjtBQUduQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7NERBQ2dDO0FBR2hEO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUM7O2tEQUNsQjt3QkFSakIsYUFBYTtJQUR6QixJQUFBLG1CQUFNLEVBQUMsZUFBZSxFQUFFLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxDQUFDO0dBQzNDLGFBQWEsQ0FTekIifQ==