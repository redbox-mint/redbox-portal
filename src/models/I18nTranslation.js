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
const assignUid = (values) => {
    const brandingPart = values.branding ? String(values.branding) : 'global';
    const locale = values.locale;
    const ns = values.namespace || 'translation';
    const key = values.key;
    if (brandingPart && locale && ns && key) {
        values.uid = `${brandingPart}:${locale}:${ns}:${key}`;
    }
};
const beforeCreate = (translation, cb) => {
    try {
        assignUid(translation);
        cb();
    }
    catch (error) {
        cb(error);
    }
};
const beforeUpdate = (values, cb) => {
    try {
        assignUid(values);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSTE4blRyYW5zbGF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL0kxOG5UcmFuc2xhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBMkY7QUFFM0YsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUEyQixFQUFFLEVBQUU7SUFDaEQsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0lBQzFFLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDN0IsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLFNBQVMsSUFBSSxhQUFhLENBQUM7SUFDN0MsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUN2QixJQUFJLFlBQVksSUFBSSxNQUFNLElBQUksRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsR0FBRyxZQUFZLElBQUksTUFBTSxJQUFJLEVBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxZQUFZLEdBQUcsQ0FBQyxXQUFnQyxFQUFFLEVBQXlCLEVBQUUsRUFBRTtJQUNuRixJQUFJLENBQUM7UUFDSCxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdkIsRUFBRSxFQUFFLENBQUM7SUFDUCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLEVBQUUsQ0FBQyxLQUFjLENBQUMsQ0FBQztJQUNyQixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxZQUFZLEdBQUcsQ0FBQyxNQUEyQixFQUFFLEVBQXlCLEVBQUUsRUFBRTtJQUM5RSxJQUFJLENBQUM7UUFDSCxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEIsRUFBRSxFQUFFLENBQUM7SUFDUCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLEVBQUUsQ0FBQyxLQUFjLENBQUMsQ0FBQztJQUNyQixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBS0ssSUFBTSxlQUFlLEdBQXJCLE1BQU0sZUFBZTtJQUVuQixHQUFHLENBQVU7SUFHYixNQUFNLENBQVU7SUFHaEIsU0FBUyxDQUFVO0lBR25CLEtBQUssQ0FBVztJQUdoQixRQUFRLENBQVU7SUFHbEIsV0FBVyxDQUFVO0lBR3JCLFFBQVEsQ0FBbUI7SUFHM0IsTUFBTSxDQUFtQjtJQUd6QixHQUFHLENBQVU7Q0FDckIsQ0FBQTtBQTNCWSwwQ0FBZTtBQUVuQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzs0Q0FDckI7QUFHYjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzsrQ0FDbEI7QUFHaEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsQ0FBQzs7a0RBQzFCO0FBR25CO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7OzhDQUNoQjtBQUdoQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDOztpREFDakI7QUFHbEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7b0RBQ2Q7QUFHckI7SUFETixJQUFBLHNCQUFTLEVBQUMsZ0JBQWdCLENBQUM7O2lEQUNNO0FBRzNCO0lBRE4sSUFBQSxzQkFBUyxFQUFDLFlBQVksQ0FBQzs7K0NBQ1E7QUFHekI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ25COzBCQTFCVCxlQUFlO0lBSDNCLElBQUEseUJBQVksRUFBQyxZQUFZLENBQUM7SUFDMUIsSUFBQSx5QkFBWSxFQUFDLFlBQVksQ0FBQztJQUMxQixJQUFBLG1CQUFNLEVBQUMsaUJBQWlCLENBQUM7R0FDYixlQUFlLENBMkIzQiJ9