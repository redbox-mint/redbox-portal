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
const buildUid = (values) => {
    const brandingPart = values.branding ? String(values.branding) : 'global';
    const locale = values.locale;
    const ns = values.namespace || 'translation';
    values.uid = `${brandingPart}:${locale}:${ns}`;
};
const beforeCreate = (bundle, cb) => {
    try {
        buildUid(bundle);
        cb();
    }
    catch (error) {
        cb(error);
    }
};
const beforeUpdate = (values, cb) => {
    try {
        if (values.locale || values.namespace || values.branding) {
            buildUid(values);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSTE4bkJ1bmRsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9JMThuQnVuZGxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUFvRztBQUVwRyxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQTJCLEVBQUUsRUFBRTtJQUMvQyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7SUFDMUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUM3QixNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsU0FBUyxJQUFJLGFBQWEsQ0FBQztJQUM3QyxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsWUFBWSxJQUFJLE1BQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztBQUNqRCxDQUFDLENBQUM7QUFFRixNQUFNLFlBQVksR0FBRyxDQUFDLE1BQTJCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQzlFLElBQUksQ0FBQztRQUNILFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQixFQUFFLEVBQUUsQ0FBQztJQUNQLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsRUFBRSxDQUFDLEtBQWMsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRixNQUFNLFlBQVksR0FBRyxDQUFDLE1BQTJCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQzlFLElBQUksQ0FBQztRQUNILElBQUksTUFBTSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN6RCxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUNELEVBQUUsRUFBRSxDQUFDO0lBQ1AsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixFQUFFLENBQUMsS0FBYyxDQUFDLENBQUM7SUFDckIsQ0FBQztBQUNILENBQUMsQ0FBQztBQUtLLElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVU7SUFFZCxNQUFNLENBQVU7SUFHaEIsV0FBVyxDQUFVO0lBR3JCLE9BQU8sQ0FBVztJQUdsQixTQUFTLENBQVU7SUFHbkIsUUFBUSxDQUFtQjtJQUczQixJQUFJLENBQTJCO0lBRy9CLE9BQU8sQ0FBYTtJQUdwQixHQUFHLENBQVU7Q0FDckIsQ0FBQTtBQXhCWSxnQ0FBVTtBQUVkO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7OzBDQUNsQjtBQUdoQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7K0NBQ0c7QUFHckI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MkNBQ25CO0FBR2xCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLENBQUM7OzZDQUMxQjtBQUduQjtJQUROLElBQUEsc0JBQVMsRUFBQyxnQkFBZ0IsQ0FBQzs7NENBQ007QUFHM0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7d0NBQ0Q7QUFHL0I7SUFETixJQUFBLG9CQUFPLEVBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDOzsyQ0FDVjtBQUdwQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOzt1Q0FDbkI7cUJBdkJULFVBQVU7SUFIdEIsSUFBQSx5QkFBWSxFQUFDLFlBQVksQ0FBQztJQUMxQixJQUFBLHlCQUFZLEVBQUMsWUFBWSxDQUFDO0lBQzFCLElBQUEsbUJBQU0sRUFBQyxZQUFZLENBQUM7R0FDUixVQUFVLENBd0J0QiJ9