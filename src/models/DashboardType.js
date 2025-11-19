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
exports.DashboardType = void 0;
const decorators_1 = require("../../lib/decorators");
const assignKey = (dashboardType, cb) => {
    dashboardType.key = `${dashboardType.branding}_${dashboardType.name}`;
    cb();
};
let DashboardType = class DashboardType {
    key;
    name;
    branding;
    formatRules;
    searchable;
};
exports.DashboardType = DashboardType;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], DashboardType.prototype, "key", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], DashboardType.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], DashboardType.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], DashboardType.prototype, "formatRules", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean', defaultsTo: true }),
    __metadata("design:type", Boolean)
], DashboardType.prototype, "searchable", void 0);
exports.DashboardType = DashboardType = __decorate([
    (0, decorators_1.BeforeCreate)(assignKey),
    (0, decorators_1.Entity)('dashboardtype')
], DashboardType);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGFzaGJvYXJkVHlwZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9EYXNoYm9hcmRUeXBlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUE2RTtBQUU3RSxNQUFNLFNBQVMsR0FBRyxDQUFDLGFBQWtDLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQ2xGLGFBQWEsQ0FBQyxHQUFHLEdBQUcsR0FBRyxhQUFhLENBQUMsUUFBUSxJQUFJLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN0RSxFQUFFLEVBQUUsQ0FBQztBQUNQLENBQUMsQ0FBQztBQUlLLElBQU0sYUFBYSxHQUFuQixNQUFNLGFBQWE7SUFFakIsR0FBRyxDQUFVO0lBR2IsSUFBSSxDQUFVO0lBR2QsUUFBUSxDQUFtQjtJQUczQixXQUFXLENBQTJCO0lBR3RDLFVBQVUsQ0FBVztDQUM3QixDQUFBO0FBZlksc0NBQWE7QUFFakI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MENBQ25CO0FBR2I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MkNBQ3BCO0FBR2Q7SUFETixJQUFBLHNCQUFTLEVBQUMsZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7OytDQUNkO0FBRzNCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O2tEQUNNO0FBR3RDO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUM7O2lEQUNoQjt3QkFkakIsYUFBYTtJQUZ6QixJQUFBLHlCQUFZLEVBQUMsU0FBUyxDQUFDO0lBQ3ZCLElBQUEsbUJBQU0sRUFBQyxlQUFlLENBQUM7R0FDWCxhQUFhLENBZXpCIn0=