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
exports.BrandingConfig = void 0;
const decorators_1 = require("../../lib/decorators");
const handleBeforeCreate = (values, proceed) => {
    if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
        const normalized = {};
        Object.keys(values.variables).forEach(key => {
            const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
            normalized[normalizedKey] = values.variables[key];
        });
        values.variables = normalized;
    }
    if (!values.variables) {
        return proceed();
    }
    if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
        return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
    }
    const allowList = (typeof sails !== 'undefined' &&
        sails.config &&
        sails.config.branding &&
        sails.config.branding.variableAllowList) ||
        [];
    const isValid = Object.keys(values.variables).every(key => {
        const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
        return allowList.includes(normalizedKey);
    });
    if (!isValid) {
        return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
    }
    return proceed();
};
const handleBeforeUpdate = (values, proceed) => {
    if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
        const normalized = {};
        Object.keys(values.variables).forEach(key => {
            const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
            normalized[normalizedKey] = values.variables[key];
        });
        values.variables = normalized;
    }
    if (!values.variables) {
        return proceed();
    }
    if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
        return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
    }
    const allowList = (typeof sails !== 'undefined' &&
        sails.config &&
        sails.config.branding &&
        sails.config.branding.variableAllowList) ||
        [];
    const isValid = Object.keys(values.variables).every(key => {
        const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
        return allowList.includes(normalizedKey);
    });
    if (!isValid) {
        return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
    }
    return proceed();
};
let BrandingConfig = class BrandingConfig {
    name;
    css;
    variables;
    version;
    hash;
    logo;
    roles;
    supportAgreementInformation;
};
exports.BrandingConfig = BrandingConfig;
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], BrandingConfig.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], BrandingConfig.prototype, "css", void 0);
__decorate([
    (0, decorators_1.Attr)({
        type: 'json',
        custom: (value) => {
            if (value == null) {
                return true;
            }
            if (typeof value !== 'object' || Array.isArray(value)) {
                return false;
            }
            const allowList = (typeof sails !== 'undefined' &&
                sails.config &&
                sails.config.branding &&
                sails.config.branding.variableAllowList) ||
                [];
            return Object.keys(value).every(key => {
                const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
                return allowList.includes(normalizedKey);
            });
        },
    }),
    __metadata("design:type", Object)
], BrandingConfig.prototype, "variables", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'number', defaultsTo: 0 }),
    __metadata("design:type", Number)
], BrandingConfig.prototype, "version", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', defaultsTo: '' }),
    __metadata("design:type", String)
], BrandingConfig.prototype, "hash", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], BrandingConfig.prototype, "logo", void 0);
__decorate([
    (0, decorators_1.HasMany)('role', 'branding'),
    __metadata("design:type", Array)
], BrandingConfig.prototype, "roles", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', defaultsTo: {} }),
    __metadata("design:type", Object)
], BrandingConfig.prototype, "supportAgreementInformation", void 0);
exports.BrandingConfig = BrandingConfig = __decorate([
    (0, decorators_1.BeforeUpdate)(handleBeforeUpdate),
    (0, decorators_1.BeforeCreate)(handleBeforeCreate),
    (0, decorators_1.Entity)('brandingconfig')
], BrandingConfig);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQnJhbmRpbmdDb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3NyYy9tb2RlbHMvQnJhbmRpbmdDb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEscURBQXlGO0FBSXpGLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxNQUEyQixFQUFFLE9BQThCLEVBQUUsRUFBRTtJQUN6RixJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksT0FBTyxNQUFNLENBQUMsU0FBUyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDakcsTUFBTSxVQUFVLEdBQTRCLEVBQUUsQ0FBQztRQUMvQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDMUMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQy9ELFVBQVUsQ0FBQyxhQUFhLENBQUMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUM7SUFDaEMsQ0FBQztJQUNELElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdEIsT0FBTyxPQUFPLEVBQUUsQ0FBQztJQUNuQixDQUFDO0lBQ0QsSUFBSSxPQUFPLE1BQU0sQ0FBQyxTQUFTLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDNUUsT0FBTyxPQUFPLENBQUMsSUFBSSxL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