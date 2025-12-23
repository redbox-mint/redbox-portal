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
exports.BrandingConfigHistory = void 0;
const decorators_1 = require("../../lib/decorators");
let BrandingConfigHistory = class BrandingConfigHistory {
    branding;
    version;
    hash;
    css;
    variables;
    dateCreated;
};
exports.BrandingConfigHistory = BrandingConfigHistory;
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], BrandingConfigHistory.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'number', required: true }),
    __metadata("design:type", Number)
], BrandingConfigHistory.prototype, "version", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], BrandingConfigHistory.prototype, "hash", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], BrandingConfigHistory.prototype, "css", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], BrandingConfigHistory.prototype, "variables", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', autoCreatedAt: true }),
    __metadata("design:type", String)
], BrandingConfigHistory.prototype, "dateCreated", void 0);
exports.BrandingConfigHistory = BrandingConfigHistory = __decorate([
    (0, decorators_1.Entity)('brandingconfighistory', {
        datastore: 'redboxStorage',
        indexes: [
            {
                attributes: {
                    branding: 1,
                    version: 1,
                },
                options: {
                    unique: true,
                },
            },
        ],
    })
], BrandingConfigHistory);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQnJhbmRpbmdDb25maWdIaXN0b3J5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL0JyYW5kaW5nQ29uZmlnSGlzdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBK0Q7QUFpQnhELElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCO0lBRXpCLFFBQVEsQ0FBbUI7SUFHM0IsT0FBTyxDQUFVO0lBR2pCLElBQUksQ0FBVTtJQUdkLEdBQUcsQ0FBVTtJQUdiLFNBQVMsQ0FBMkI7SUFHcEMsV0FBVyxDQUFVO0NBQzdCLENBQUE7QUFsQlksc0RBQXFCO0FBRXpCO0lBRE4sSUFBQSxzQkFBUyxFQUFDLGdCQUFnQixFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzt1REFDZDtBQUczQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOztzREFDakI7QUFHakI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7bURBQ3BCO0FBR2Q7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O2tEQUNMO0FBR2I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7O3dEQUNvQjtBQUdwQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDOzswREFDbEI7Z0NBakJqQixxQkFBcUI7SUFkakMsSUFBQSxtQkFBTSxFQUFDLHVCQUF1QixFQUFFO1FBQy9CLFNBQVMsRUFBRSxlQUFlO1FBQzFCLE9BQU8sRUFBRTtZQUNQO2dCQUNFLFVBQVUsRUFBRTtvQkFDVixRQUFRLEVBQUUsQ0FBQztvQkFDWCxPQUFPLEVBQUUsQ0FBQztpQkFDWDtnQkFDRCxPQUFPLEVBQUU7b0JBQ1AsTUFBTSxFQUFFLElBQUk7aUJBQ2I7YUFDRjtTQUNGO0tBQ0YsQ0FBQztHQUNXLHFCQUFxQixDQWtCakMifQ==