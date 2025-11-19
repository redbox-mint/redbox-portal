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
exports.CacheEntry = void 0;
const decorators_1 = require("../../lib/decorators");
let CacheEntry = class CacheEntry {
    name;
    data;
    ts_added;
};
exports.CacheEntry = CacheEntry;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true, unique: true }),
    __metadata("design:type", String)
], CacheEntry.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], CacheEntry.prototype, "data", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'number', required: true }),
    __metadata("design:type", Number)
], CacheEntry.prototype, "ts_added", void 0);
exports.CacheEntry = CacheEntry = __decorate([
    (0, decorators_1.Entity)('cacheentry')
], CacheEntry);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2FjaGVFbnRyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9DYWNoZUVudHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUFvRDtBQUc3QyxJQUFNLFVBQVUsR0FBaEIsTUFBTSxVQUFVO0lBRWQsSUFBSSxDQUFVO0lBR2QsSUFBSSxDQUEyQjtJQUcvQixRQUFRLENBQVU7Q0FDMUIsQ0FBQTtBQVRZLGdDQUFVO0FBRWQ7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOzt3Q0FDbEM7QUFHZDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7d0NBQ2U7QUFHL0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ2hCO3FCQVJkLFVBQVU7SUFEdEIsSUFBQSxtQkFBTSxFQUFDLFlBQVksQ0FBQztHQUNSLFVBQVUsQ0FTdEIifQ==