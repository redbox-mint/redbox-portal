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
exports.ThemeConfig = void 0;
const decorators_1 = require("../../lib/decorators");
let ThemeConfig = class ThemeConfig {
    name;
    css;
};
exports.ThemeConfig = ThemeConfig;
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], ThemeConfig.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], ThemeConfig.prototype, "css", void 0);
exports.ThemeConfig = ThemeConfig = __decorate([
    (0, decorators_1.Entity)('themeconfig')
], ThemeConfig);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGhlbWVDb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3NyYy9tb2RlbHMvVGhlbWVDb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEscURBQW9EO0FBRzdDLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVc7SUFFZixJQUFJLENBQVU7SUFHZCxHQUFHLENBQVU7Q0FDckIsQ0FBQTtBQU5ZLGtDQUFXO0FBRWY7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O3lDQUNKO0FBR2Q7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O3dDQUNMO3NCQUxULFdBQVc7SUFEdkIsSUFBQSxtQkFBTSxFQUFDLGFBQWEsQ0FBQztHQUNULFdBQVcsQ0FNdkIifQ==