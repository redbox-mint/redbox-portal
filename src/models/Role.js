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
exports.Role = void 0;
const decorators_1 = require("../../lib/decorators");
let Role = class Role {
    name;
    branding;
    users;
};
exports.Role = Role;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], Role.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig'),
    __metadata("design:type", Object)
], Role.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.HasMany)('user', 'roles', { dominant: true }),
    __metadata("design:type", Array)
], Role.prototype, "users", void 0);
exports.Role = Role = __decorate([
    (0, decorators_1.Entity)('role')
], Role);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUm9sZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9Sb2xlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUF3RTtBQUdqRSxJQUFNLElBQUksR0FBVixNQUFNLElBQUk7SUFFUixJQUFJLENBQVU7SUFHZCxRQUFRLENBQW1CO0lBRzNCLEtBQUssQ0FBYTtDQUMxQixDQUFBO0FBVFksb0JBQUk7QUFFUjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztrQ0FDcEI7QUFHZDtJQUROLElBQUEsc0JBQVMsRUFBQyxnQkFBZ0IsQ0FBQzs7c0NBQ007QUFHM0I7SUFETixJQUFBLG9CQUFPLEVBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7bUNBQ3BCO2VBUmQsSUFBSTtJQURoQixJQUFBLG1CQUFNLEVBQUMsTUFBTSxDQUFDO0dBQ0YsSUFBSSxDQVNoQiJ9