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
exports.Record = void 0;
const decorators_1 = require("../../lib/decorators");
let Record = class Record {
    redboxOid;
    harvestId;
    metaMetadata;
    metadata;
    workflow;
    authorization;
    dateCreated;
    lastSaveDate;
};
exports.Record = Record;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], Record.prototype, "redboxOid", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], Record.prototype, "harvestId", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Record.prototype, "metaMetadata", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Record.prototype, "metadata", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Record.prototype, "workflow", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Record.prototype, "authorization", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], Record.prototype, "dateCreated", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', autoUpdatedAt: true }),
    __metadata("design:type", String)
], Record.prototype, "lastSaveDate", void 0);
exports.Record = Record = __decorate([
    (0, decorators_1.Entity)('record', {
        datastore: 'redboxStorage',
        autoCreatedAt: false,
        autoUpdatedAt: false,
    })
], Record);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL1JlY29yZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBb0Q7QUFTN0MsSUFBTSxNQUFNLEdBQVosTUFBTSxNQUFNO0lBRVYsU0FBUyxDQUFVO0lBR25CLFNBQVMsQ0FBVTtJQUduQixZQUFZLENBQVc7SUFHdkIsUUFBUSxDQUFXO0lBR25CLFFBQVEsQ0FBVztJQUduQixhQUFhLENBQVc7SUFHeEIsV0FBVyxDQUFVO0lBR3JCLFlBQVksQ0FBVTtDQUM5QixDQUFBO0FBeEJZLHdCQUFNO0FBRVY7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7eUNBQ2I7QUFHbkI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O3lDQUNDO0FBR25CO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzs0Q0FDTztBQUd2QjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7d0NBQ0c7QUFHbkI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7O3dDQUNHO0FBR25CO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzs2Q0FDUTtBQUd4QjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDOzsyQ0FDbEI7QUFHckI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ2pCO2lCQXZCbEIsTUFBTTtJQUxsQixJQUFBLG1CQUFNLEVBQUMsUUFBUSxFQUFFO1FBQ2hCLFNBQVMsRUFBRSxlQUFlO1FBQzFCLGFBQWEsRUFBRSxLQUFLO1FBQ3BCLGFBQWEsRUFBRSxLQUFLO0tBQ3JCLENBQUM7R0FDVyxNQUFNLENBd0JsQiJ9