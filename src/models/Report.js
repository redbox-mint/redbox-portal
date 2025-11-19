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
exports.Report = void 0;
const decorators_1 = require("../../lib/decorators");
const assignKey = (report, cb) => {
    report.key = `${report.branding}_${report.name}`;
    cb();
};
let Report = class Report {
    key;
    name;
    title;
    branding;
    reportSource;
    solrQuery;
    databaseQuery;
    filter;
    columns;
};
exports.Report = Report;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], Report.prototype, "key", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], Report.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], Report.prototype, "title", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], Report.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], Report.prototype, "reportSource", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Report.prototype, "solrQuery", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Report.prototype, "databaseQuery", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], Report.prototype, "filter", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], Report.prototype, "columns", void 0);
exports.Report = Report = __decorate([
    (0, decorators_1.BeforeCreate)(assignKey),
    (0, decorators_1.Entity)('report')
], Report);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL1JlcG9ydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBNkU7QUFFN0UsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUEyQixFQUFFLEVBQXlCLEVBQUUsRUFBRTtJQUMzRSxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDakQsRUFBRSxFQUFFLENBQUM7QUFDUCxDQUFDLENBQUM7QUFJSyxJQUFNLE1BQU0sR0FBWixNQUFNLE1BQU07SUFFVixHQUFHLENBQVU7SUFHYixJQUFJLENBQVU7SUFHZCxLQUFLLENBQVU7SUFHZixRQUFRLENBQW1CO0lBRzNCLFlBQVksQ0FBVTtJQUd0QixTQUFTLENBQTJCO0lBR3BDLGFBQWEsQ0FBMkI7SUFHeEMsTUFBTSxDQUEyQjtJQUdqQyxPQUFPLENBQTJCO0NBQzFDLENBQUE7QUEzQlksd0JBQU07QUFFVjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOzttQ0FDbkI7QUFHYjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztvQ0FDcEI7QUFHZDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztxQ0FDbkI7QUFHZjtJQUROLElBQUEsc0JBQVMsRUFBQyxnQkFBZ0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7d0NBQ2Q7QUFHM0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7OzRDQUNJO0FBR3RCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzt5Q0FDb0I7QUFHcEM7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzZDQUN3QjtBQUd4QztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztzQ0FDQztBQUdqQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzt1Q0FDRTtpQkExQjlCLE1BQU07SUFGbEIsSUFBQSx5QkFBWSxFQUFDLFNBQVMsQ0FBQztJQUN2QixJQUFBLG1CQUFNLEVBQUMsUUFBUSxDQUFDO0dBQ0osTUFBTSxDQTJCbEIifQ==