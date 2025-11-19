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
exports.WorkspaceType = void 0;
const decorators_1 = require("../../lib/decorators");
let WorkspaceType = class WorkspaceType {
    name;
    branding;
    logo;
    subtitle;
    description;
    externallyProvisioned;
};
exports.WorkspaceType = WorkspaceType;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceType.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], WorkspaceType.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], WorkspaceType.prototype, "logo", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], WorkspaceType.prototype, "subtitle", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], WorkspaceType.prototype, "description", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean', defaultsTo: false }),
    __metadata("design:type", Boolean)
], WorkspaceType.prototype, "externallyProvisioned", void 0);
exports.WorkspaceType = WorkspaceType = __decorate([
    (0, decorators_1.Entity)('workspacetype')
], WorkspaceType);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV29ya3NwYWNlVHlwZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9Xb3Jrc3BhY2VUeXBlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUErRDtBQUd4RCxJQUFNLGFBQWEsR0FBbkIsTUFBTSxhQUFhO0lBRWpCLElBQUksQ0FBVTtJQUdkLFFBQVEsQ0FBbUI7SUFHM0IsSUFBSSxDQUFVO0lBR2QsUUFBUSxDQUFVO0lBR2xCLFdBQVcsQ0FBVTtJQUdyQixxQkFBcUIsQ0FBVztDQUN4QyxDQUFBO0FBbEJZLHNDQUFhO0FBRWpCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7OzJDQUNwQjtBQUdkO0lBRE4sSUFBQSxzQkFBUyxFQUFDLGdCQUFnQixFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzsrQ0FDZDtBQUczQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7MkNBQ0o7QUFHZDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7K0NBQ0E7QUFHbEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O2tEQUNHO0FBR3JCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUM7OzREQUNOO3dCQWpCNUIsYUFBYTtJQUR6QixJQUFBLG1CQUFNLEVBQUMsZUFBZSxDQUFDO0dBQ1gsYUFBYSxDQWtCekIifQ==