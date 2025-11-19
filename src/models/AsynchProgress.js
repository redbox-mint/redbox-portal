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
exports.AsynchProgress = void 0;
const decorators_1 = require("../../lib/decorators");
let AsynchProgress = class AsynchProgress {
    name;
    branding;
    date_started;
    date_completed;
    started_by;
    currentIdx;
    targetIdx;
    status;
    message;
    metadata;
    relatedRecordId;
    taskType;
};
exports.AsynchProgress = AsynchProgress;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], AsynchProgress.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', columnType: 'datetime' }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "date_started", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', columnType: 'datetime' }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "date_completed", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "started_by", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'number' }),
    __metadata("design:type", Number)
], AsynchProgress.prototype, "currentIdx", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'number' }),
    __metadata("design:type", Number)
], AsynchProgress.prototype, "targetIdx", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "status", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "message", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], AsynchProgress.prototype, "metadata", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "relatedRecordId", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], AsynchProgress.prototype, "taskType", void 0);
exports.AsynchProgress = AsynchProgress = __decorate([
    (0, decorators_1.Entity)('asynchprogress')
], AsynchProgress);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXN5bmNoUHJvZ3Jlc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3NyYy9tb2RlbHMvQXN5bmNoUHJvZ3Jlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEscURBQStEO0FBR3hELElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWM7SUFFbEIsSUFBSSxDQUFVO0lBR2QsUUFBUSxDQUFtQjtJQUczQixZQUFZLENBQVU7SUFHdEIsY0FBYyxDQUFVO0lBR3hCLFVBQVUsQ0FBVTtJQUdwQixVQUFVLENBQVU7SUFHcEIsU0FBUyxDQUFVO0lBR25CLE1BQU0sQ0FBVTtJQUdoQixPQUFPLENBQVU7SUFHakIsUUFBUSxDQUEyQjtJQUduQyxlQUFlLENBQVU7SUFHekIsUUFBUSxDQUFVO0NBQzFCLENBQUE7QUFwQ1ksd0NBQWM7QUFFbEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ3BCO0FBR2Q7SUFETixJQUFBLHNCQUFTLEVBQUMsZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O2dEQUNkO0FBRzNCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLENBQUM7O29EQUNwQjtBQUd0QjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxDQUFDOztzREFDbEI7QUFHeEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7a0RBQ2Q7QUFHcEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O2tEQUNFO0FBR3BCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDOztpREFDQztBQUduQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7OENBQ0Y7QUFHaEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7OytDQUNEO0FBR2pCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOztnREFDbUI7QUFHbkM7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O3VEQUNPO0FBR3pCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDOztnREFDQTt5QkFuQ2QsY0FBYztJQUQxQixJQUFBLG1CQUFNLEVBQUMsZ0JBQWdCLENBQUM7R0FDWixjQUFjLENBb0MxQiJ9