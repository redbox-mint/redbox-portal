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
exports.WorkflowStep = void 0;
const decorators_1 = require("../../lib/decorators");
let WorkflowStep = class WorkflowStep {
    name;
    form;
    config;
    starting;
    recordType;
    hidden;
};
exports.WorkflowStep = WorkflowStep;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkflowStep.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('form'),
    __metadata("design:type", Object)
], WorkflowStep.prototype, "form", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], WorkflowStep.prototype, "config", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean', required: true }),
    __metadata("design:type", Boolean)
], WorkflowStep.prototype, "starting", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('recordType'),
    __metadata("design:type", Object)
], WorkflowStep.prototype, "recordType", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean', defaultsTo: false }),
    __metadata("design:type", Boolean)
], WorkflowStep.prototype, "hidden", void 0);
exports.WorkflowStep = WorkflowStep = __decorate([
    (0, decorators_1.Entity)('workflowstep')
], WorkflowStep);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV29ya2Zsb3dTdGVwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL1dvcmtmbG93U3RlcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBK0Q7QUFHeEQsSUFBTSxZQUFZLEdBQWxCLE1BQU0sWUFBWTtJQUVoQixJQUFJLENBQVU7SUFHZCxJQUFJLENBQW1CO0lBR3ZCLE1BQU0sQ0FBMkI7SUFHakMsUUFBUSxDQUFXO0lBR25CLFVBQVUsQ0FBbUI7SUFHN0IsTUFBTSxDQUFXO0NBQ3pCLENBQUE7QUFsQlksb0NBQVk7QUFFaEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MENBQ3BCO0FBR2Q7SUFETixJQUFBLHNCQUFTLEVBQUMsTUFBTSxDQUFDOzswQ0FDWTtBQUd2QjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs0Q0FDQztBQUdqQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs4Q0FDaEI7QUFHbkI7SUFETixJQUFBLHNCQUFTLEVBQUMsWUFBWSxDQUFDOztnREFDWTtBQUc3QjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDOzs0Q0FDckI7dUJBakJiLFlBQVk7SUFEeEIsSUFBQSxtQkFBTSxFQUFDLGNBQWMsQ0FBQztHQUNWLFlBQVksQ0FrQnhCIn0=