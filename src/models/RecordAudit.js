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
exports.RecordAudit = void 0;
const decorators_1 = require("../../lib/decorators");
let RecordAudit = class RecordAudit {
    user;
    record;
    dateCreated;
    action;
};
exports.RecordAudit = RecordAudit;
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordAudit.prototype, "user", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], RecordAudit.prototype, "record", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], RecordAudit.prototype, "dateCreated", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], RecordAudit.prototype, "action", void 0);
exports.RecordAudit = RecordAudit = __decorate([
    (0, decorators_1.Entity)('recordaudit', { datastore: 'redboxStorage' })
], RecordAudit);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjb3JkQXVkaXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3NyYy9tb2RlbHMvUmVjb3JkQXVkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEscURBQW9EO0FBRzdDLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVc7SUFFZixJQUFJLENBQTJCO0lBRy9CLE1BQU0sQ0FBMkI7SUFHakMsV0FBVyxDQUFVO0lBR3JCLE1BQU0sQ0FBVTtDQUN4QixDQUFBO0FBWlksa0NBQVc7QUFFZjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7eUNBQ2U7QUFHL0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzJDQUNpQjtBQUdqQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDOztnREFDbEI7QUFHckI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7OzJDQUNGO3NCQVhaLFdBQVc7SUFEdkIsSUFBQSxtQkFBTSxFQUFDLGFBQWEsRUFBRSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsQ0FBQztHQUN6QyxXQUFXLENBWXZCIn0=