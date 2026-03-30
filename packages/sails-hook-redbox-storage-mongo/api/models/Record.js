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
const redbox_core_1 = require("@researchdatabox/redbox-core");
let RecordClass = class RecordClass {
    redboxOid;
    harvestId;
    metaMetadata;
    metadata;
    workflow;
    authorization;
    dateCreated;
    lastSaveDate;
};
exports.RecordClass = RecordClass;
__decorate([
    (0, redbox_core_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], RecordClass.prototype, "redboxOid", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], RecordClass.prototype, "harvestId", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "metaMetadata", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "metadata", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "workflow", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordClass.prototype, "authorization", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], RecordClass.prototype, "dateCreated", void 0);
__decorate([
    (0, redbox_core_1.Attr)({ type: 'string', autoUpdatedAt: true }),
    __metadata("design:type", String)
], RecordClass.prototype, "lastSaveDate", void 0);
exports.RecordClass = RecordClass = __decorate([
    (0, redbox_core_1.Entity)('record', {
        datastore: 'redboxStorage',
    })
], RecordClass);
// Export the Waterline model definition for runtime use
exports.RecordWLDef = (0, redbox_core_1.toWaterlineModelDef)(RecordClass);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9hcGkvbW9kZWxzL1JlY29yZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSw0QkFBMEI7QUFDMUIsOERBQWlGO0FBTzFFLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVc7SUFFZixTQUFTLENBQVU7SUFHbkIsU0FBUyxDQUFVO0lBR25CLFlBQVksQ0FBVztJQUd2QixRQUFRLENBQVc7SUFHbkIsUUFBUSxDQUFXO0lBR25CLGFBQWEsQ0FBVztJQUd4QixXQUFXLENBQVU7SUFHckIsWUFBWSxDQUFVO0NBQzlCLENBQUE7QUF4Qlksa0NBQVc7QUFFZjtJQUROLElBQUEsa0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOzs4Q0FDYjtBQUduQjtJQUROLElBQUEsa0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7OENBQ0M7QUFHbkI7SUFETixJQUFBLGtCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7O2lEQUNPO0FBR3ZCO0lBRE4sSUFBQSxrQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzs2Q0FDRztBQUduQjtJQUROLElBQUEsa0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7NkNBQ0c7QUFHbkI7SUFETixJQUFBLGtCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7O2tEQUNRO0FBR3hCO0lBRE4sSUFBQSxrQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUM7O2dEQUNsQjtBQUdyQjtJQUROLElBQUEsa0JBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDOztpREFDakI7c0JBdkJsQixXQUFXO0lBSHZCLElBQUEsb0JBQU0sRUFBQyxRQUFRLEVBQUU7UUFDaEIsU0FBUyxFQUFFLGVBQWU7S0FDM0IsQ0FBQztHQUNXLFdBQVcsQ0F3QnZCO0FBRUQsd0RBQXdEO0FBQzNDLFFBQUEsV0FBVyxHQUFHLElBQUEsaUNBQW1CLEVBQUMsV0FBVyxDQUFDLENBQUMifQ==