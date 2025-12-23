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
exports.I18nTranslation = void 0;
const decorators_1 = require("../../lib/decorators");
const beforeCreate = (translation, cb) => {
    try {
        const brandingPart = translation.branding ? String(translation.branding) : 'global';
        const locale = translation.locale;
        const ns = translation.namespace || 'translation';
        const key = translation.key;
        if (brandingPart && locale && ns && key) {
            translation.uid = `${brandingPart}:${locale}:${ns}:${key}`;
        }
        cb();
    }
    catch (error) {
        cb(error);
    }
};
const beforeUpdate = (values, cb) => {
    try {
        const brandingPart = values.branding ? String(values.branding) : 'global';
        const locale = values.locale;
        const ns = values.namespace || 'translation';
        const key = values.key;
        if (brandingPart && locale && ns && key) {
            values.uid = `${brandingPart}:${locale}:${ns}:${key}`;
        }
        cb();
    }
    catch (error) {
        cb(error);
    }
};
let I18nTranslation = class I18nTranslation {
    key;
    locale;
    namespace;
    value;
    category;
    description;
    branding;
    bundle;
    uid;
};
exports.I18nTranslation = I18nTranslation;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], I18nTranslation.prototype, "key", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], I18nTranslation.prototype, "locale", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', defaultsTo: 'translation' }),
    __metadata("design:type", String)
], I18nTranslation.prototype, "namespace", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], I18nTranslation.prototype, "value", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', allowNull: true }),
    __metadata("design:type", String)
], I18nTranslation.prototype, "category", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', allowNull: true }),
    __metadata("design:type", String)
], I18nTranslation.prototype, "description", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig'),
    __metadata("design:type", Object)
], I18nTranslation.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('i18nbundle'),
    __metadata("design:type", Object)
], I18nTranslation.prototype, "bundle", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], I18nTranslation.prototype, "uid", void 0);
exports.I18nTranslation = I18nTranslation = __decorate([
    (0, decorators_1.BeforeUpdate)(beforeUpdate),
    (0, decorators_1.BeforeCreate)(beforeCreate),
    (0, decorators_1.Entity)('i18ntranslation')
], I18nTranslation);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSTE4blRyYW5zbGF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL0kxOG5UcmFuc2xhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBMkY7QUFFM0YsTUFBTSxZQUFZLEdBQUcsQ0FBQyxXQUFnQyxFQUFFLEVBQXlCLEVBQUUsRUFBRTtJQUNuRixJQUFJLENBQUM7UUFDSCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDcEYsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztRQUNsQyxNQUFNLEVBQUUsR0FBRyxXQUFXLENBQUMsU0FBUyxJQUFJLGFBQWEsQ0FBQztRQUNsRCxNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDO1FBQzVCLElBQUksWUFBWSxJQUFJLE1BQU0sSUFBSSxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7WUFDeEMsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLFlBQVksSUFBSSxNQUFNLElBQUksRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzdELENBQUM7UUFDRCxFQUFFLEVBQUUsQ0FBQztJQUNQLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsRUFBRSxDQUFDLEtBQWMsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRixNQUFNLFlBQVksR0FBRyxDQUFDLE1BQTJCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQzlFLElBQUksQ0FBQztRQUNILE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUMxRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQzdCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxTQUFTLElBQUksYUFBYSxDQUFDO1FBQzdDLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDdkIsSUFBSSxZQUFZLElBQUksTUFBTSxJQUFJLEVBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUN4QyxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsWUFBWSxJQUFJLE1BQU0sSUFBSSxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEQsQ0FBQztRQUNELEVBQUUsRUFBRSxDQUFDO0lBQ1AsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixFQUFFLENBQUMsS0FBYyxDQUFDLENBQUM7SUFDckIsQ0FBQztBQUNILENBQUMsQ0FBQztBQUtLLElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWU7SUFFbkIsR0FBRyxDQUFVO0lBR2IsTUFBTSxDQUFVO0lBR2hCLFNBQVMsQ0FBVTtJQUduQixLQUFLLENBQVc7SUFHaEIsUUFBUSxDQUFVO0lBR2xCLFdBQVcsQ0FBVTtJQUdyQixRQUFRLENBQW1CO0lBRzNCLE1BQU0sQ0FBbUI7SUFHekIsR0FBRyxDQUFVO0NBQ3JCLENBQUE7QUEzQlksMENBQWU7QUFFbkI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ3JCO0FBR2I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7K0NBQ2xCO0FBR2hCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLENBQUM7O2tEQUMxQjtBQUduQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs4Q0FDaEI7QUFHaEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7aURBQ2pCO0FBR2xCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7O29EQUNkO0FBR3JCO0lBRE4sSUFBQSxzQkFBUyxFQUFDLGdCQUFnQixDQUFDOztpREFDTTtBQUczQjtJQUROLElBQUEsc0JBQVMsRUFBQyxZQUFZLENBQUM7OytDQUNRO0FBR3pCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7OzRDQUNuQjswQkExQlQsZUFBZTtJQUgzQixJQUFBLHlCQUFZLEVBQUMsWUFBWSxDQUFDO0lBQzFCLElBQUEseUJBQVksRUFBQyxZQUFZLENBQUM7SUFDMUIsSUFBQSxtQkFBTSxFQUFDLGlCQUFpQixDQUFDO0dBQ2IsZUFBZSxDQTJCM0IifQ==