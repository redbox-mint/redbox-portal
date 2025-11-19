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
exports.AppConfig = void 0;
const decorators_1 = require("../../lib/decorators");
let AppConfig = class AppConfig {
    configKey;
    branding;
    configData;
};
exports.AppConfig = AppConfig;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], AppConfig.prototype, "configKey", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], AppConfig.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], AppConfig.prototype, "configData", void 0);
exports.AppConfig = AppConfig = __decorate([
    (0, decorators_1.Entity)('appconfig')
], AppConfig);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwQ29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL0FwcENvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBK0Q7QUFHeEQsSUFBTSxTQUFTLEdBQWYsTUFBTSxTQUFTO0lBRWIsU0FBUyxDQUFVO0lBR25CLFFBQVEsQ0FBbUI7SUFHM0IsVUFBVSxDQUEyQjtDQUM3QyxDQUFBO0FBVFksOEJBQVM7QUFFYjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs0Q0FDZjtBQUduQjtJQUROLElBQUEsc0JBQVMsRUFBQyxnQkFBZ0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MkNBQ2Q7QUFHM0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzZDQUNxQjtvQkFSakMsU0FBUztJQURyQixJQUFBLG1CQUFNLEVBQUMsV0FBVyxDQUFDO0dBQ1AsU0FBUyxDQVNyQiJ9