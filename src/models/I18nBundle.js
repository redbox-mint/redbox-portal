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
exports.I18nBundle = void 0;
const decorators_1 = require("../../lib/decorators");
const beforeCreate = (bundle, cb) => {
    try {
        const brandingPart = bundle.branding ? String(bundle.branding) : 'global';
        const locale = bundle.locale;
        const ns = bundle.namespace || 'translation';
        bundle.uid = `${brandingPart}:${locale}:${ns}`;
        cb();
    }
    catch (error) {
        cb(error);
    }
};
const beforeUpdate = (values, cb) => {
    try {
        if (values.locale || values.namespace || values.branding) {
            const brandingPart = values.branding ? String(values.branding) : 'global';
            const locale = values.locale;
            const ns = values.namespace || 'translation';
        }
        cb();
    }
    catch (error) {
        cb(error);
    }
};
let I18nBundle = class I18nBundle {
    locale;
    displayName;
    enabled;
    namespace;
    branding;
    data;
    entries;
    uid;
};
exports.I18nBundle = I18nBundle;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], I18nBundle.prototype, "locale", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], I18nBundle.prototype, "displayName", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean', defaultsTo: true }),
    __metadata("design:type", Boolean)
], I18nBundle.prototype, "enabled", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', defaultsTo: 'translation' }),
    __metadata("design:type", String)
], I18nBundle.prototype, "namespace", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig'),
    __metadata("design:type", Object)
], I18nBundle.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], I18nBundle.prototype, "data", void 0);
__decorate([
    (0, decorators_1.HasMany)('i18ntranslation', 'bundle'),
    __metadata("design:type", Array)
], I18nBundle.prototype, "entries", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], I18nBundle.prototype, "uid", void 0);
exports.I18nBundle = I18nBundle = __decorate([
    (0, decorators_1.BeforeUpdate)(beforeUpdate),
    (0, decorators_1.BeforeCreate)(beforeCreate),
    (0, decorators_1.Entity)('i18nbundle')
], I18nBundle);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSTE4bkJ1bmRsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9JMThuQnVuZGxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUFvRztBQUVwRyxNQUFNLFlBQVksR0FBRyxDQUFDLE1BQTJCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQzlFLElBQUksQ0FBQztRQUNILE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUMxRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQzdCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxTQUFTLElBQUksYUFBYSxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsR0FBRyxZQUFZLElBQUksTUFBTSxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQy9DLEVBQUUsRUFBRSxDQUFDO0lBQ1AsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixFQUFFLENBQUMsS0FBYyxDQUFDLENBQUM7SUFDckIsQ0FBQztBQUNILENBQUMsQ0FBQztBQUVGLE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBMkIsRUFBRSxFQUF5QixFQUFFLEVBQUU7SUFDOUUsSUFBSSxDQUFDO1FBQ0gsSUFBSSxNQUFNLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3pELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUMxRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQzdCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxTQUFTLElBQUksYUFBYSxDQUFDO1FBQy9DLENBQUM7UUFDRCxFQUFFLEVBQUUsQ0FBQztJQUNQLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsRUFBRSxDQUFDLEtBQWMsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7QUFDSCxDQUFDLENBQUM7QUFLSyxJQUFNLFVBQVUsR0FBaEIsTUFBTSxVQUFVO0lBRWQsTUFBTSxDQUFVO0lBR2hCLFdBQVcsQ0FBVTtJQUdyQixPQUFPLENBQVc7SUFHbEIsU0FBUyxDQUFVO0lBR25CLFFBQVEsQ0FBbUI7SUFHM0IsSUFBSSxDQUEyQjtJQUcvQixPQUFPLENBQWE7SUFHcEIsR0FBRyxDQUFVO0NBQ3JCLENBQUE7QUF4QlksZ0NBQVU7QUFFZDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzswQ0FDbEI7QUFHaEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7OytDQUNHO0FBR3JCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUM7OzJDQUNuQjtBQUdsQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxDQUFDOzs2Q0FDMUI7QUFHbkI7SUFETixJQUFBLHNCQUFTLEVBQUMsZ0JBQWdCLENBQUM7OzRDQUNNO0FBRzNCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O3dDQUNEO0FBRy9CO0lBRE4sSUFBQSxvQkFBTyxFQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQzs7MkNBQ1Y7QUFHcEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7dUNBQ25CO3FCQXZCVCxVQUFVO0lBSHRCLElBQUEseUJBQVksRUFBQyxZQUFZLENBQUM7SUFDMUIsSUFBQSx5QkFBWSxFQUFDLFlBQVksQ0FBQztJQUMxQixJQUFBLG1CQUFNLEVBQUMsWUFBWSxDQUFDO0dBQ1IsVUFBVSxDQXdCdEIifQ==