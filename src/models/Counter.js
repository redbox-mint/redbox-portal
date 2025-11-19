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
exports.Counter = void 0;
const decorators_1 = require("../../lib/decorators");
let Counter = class Counter {
    name;
    branding;
    value;
};
exports.Counter = Counter;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true, unique: true }),
    __metadata("design:type", String)
], Counter.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig'),
    __metadata("design:type", Object)
], Counter.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'number' }),
    __metadata("design:type", Number)
], Counter.prototype, "value", void 0);
exports.Counter = Counter = __decorate([
    (0, decorators_1.Entity)('counter')
], Counter);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ291bnRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9Db3VudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUErRDtBQUd4RCxJQUFNLE9BQU8sR0FBYixNQUFNLE9BQU87SUFFWCxJQUFJLENBQVU7SUFHZCxRQUFRLENBQW1CO0lBRzNCLEtBQUssQ0FBVTtDQUN2QixDQUFBO0FBVFksMEJBQU87QUFFWDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7O3FDQUNsQztBQUdkO0lBRE4sSUFBQSxzQkFBUyxFQUFDLGdCQUFnQixDQUFDOzt5Q0FDTTtBQUczQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7c0NBQ0g7a0JBUlgsT0FBTztJQURuQixJQUFBLG1CQUFNLEVBQUMsU0FBUyxDQUFDO0dBQ0wsT0FBTyxDQVNuQiJ9