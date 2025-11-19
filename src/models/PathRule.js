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
exports.PathRule = void 0;
const decorators_1 = require("../../lib/decorators");
let PathRule = class PathRule {
    path;
    role;
    branding;
    can_read;
    can_write;
    custom;
};
exports.PathRule = PathRule;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], PathRule.prototype, "path", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('role', { required: true }),
    __metadata("design:type", Object)
], PathRule.prototype, "role", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], PathRule.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean' }),
    __metadata("design:type", Boolean)
], PathRule.prototype, "can_read", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean' }),
    __metadata("design:type", Boolean)
], PathRule.prototype, "can_write", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], PathRule.prototype, "custom", void 0);
exports.PathRule = PathRule = __decorate([
    (0, decorators_1.Entity)('pathrule')
], PathRule);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGF0aFJ1bGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3NyYy9tb2RlbHMvUGF0aFJ1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEscURBQStEO0FBR3hELElBQU0sUUFBUSxHQUFkLE1BQU0sUUFBUTtJQUVaLElBQUksQ0FBVTtJQUdkLElBQUksQ0FBbUI7SUFHdkIsUUFBUSxDQUFtQjtJQUczQixRQUFRLENBQVc7SUFHbkIsU0FBUyxDQUFXO0lBR3BCLE1BQU0sQ0FBVTtDQUN4QixDQUFBO0FBbEJZLDRCQUFRO0FBRVo7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7c0NBQ3BCO0FBR2Q7SUFETixJQUFBLHNCQUFTLEVBQUMsTUFBTSxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztzQ0FDUjtBQUd2QjtJQUROLElBQUEsc0JBQVMsRUFBQyxnQkFBZ0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MENBQ2Q7QUFHM0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7OzBDQUNBO0FBR25CO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDOzsyQ0FDQztBQUdwQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7d0NBQ0Y7bUJBakJaLFFBQVE7SUFEcEIsSUFBQSxtQkFBTSxFQUFDLFVBQVUsQ0FBQztHQUNOLFFBQVEsQ0FrQnBCIn0=