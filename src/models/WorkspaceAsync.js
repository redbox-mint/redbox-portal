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
exports.WorkspaceAsync = void 0;
const decorators_1 = require("../../lib/decorators");
let WorkspaceAsync = class WorkspaceAsync {
    name;
    recordType;
    date_started;
    date_completed;
    started_by;
    service;
    method;
    args;
    status;
    message;
};
exports.WorkspaceAsync = WorkspaceAsync;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "recordType", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', columnType: 'datetime' }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "date_started", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', columnType: 'datetime' }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "date_completed", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "started_by", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "service", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "method", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], WorkspaceAsync.prototype, "args", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], WorkspaceAsync.prototype, "status", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], WorkspaceAsync.prototype, "message", void 0);
exports.WorkspaceAsync = WorkspaceAsync = __decorate([
    (0, decorators_1.Entity)('workspaceasync')
], WorkspaceAsync);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV29ya3NwYWNlQXN5bmMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3NyYy9tb2RlbHMvV29ya3NwYWNlQXN5bmMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEscURBQW9EO0FBRzdDLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWM7SUFFbEIsSUFBSSxDQUFVO0lBR2QsVUFBVSxDQUFVO0lBR3BCLFlBQVksQ0FBVTtJQUd0QixjQUFjLENBQVU7SUFHeEIsVUFBVSxDQUFVO0lBR3BCLE9BQU8sQ0FBVTtJQUdqQixNQUFNLENBQVU7SUFHaEIsSUFBSSxDQUFXO0lBR2YsTUFBTSxDQUFVO0lBR2hCLE9BQU8sQ0FBMkI7Q0FDMUMsQ0FBQTtBQTlCWSx3Q0FBYztBQUVsQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs0Q0FDcEI7QUFHZDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztrREFDZDtBQUdwQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxDQUFDOztvREFDcEI7QUFHdEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsQ0FBQzs7c0RBQ2xCO0FBR3hCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O2tEQUNkO0FBR3BCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7OytDQUNqQjtBQUdqQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs4Q0FDbEI7QUFHaEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ2pCO0FBR2Y7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7OzhDQUNGO0FBR2hCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzsrQ0FDa0I7eUJBN0I5QixjQUFjO0lBRDFCLElBQUEsbUJBQU0sRUFBQyxnQkFBZ0IsQ0FBQztHQUNaLGNBQWMsQ0E4QjFCIn0=