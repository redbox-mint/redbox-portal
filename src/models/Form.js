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
exports.Form = void 0;
const decorators_1 = require("../../lib/decorators");
let Form = class Form {
    name;
    customAngularApp;
    fields;
    workflowStep;
    type;
    messages;
    requiredFieldIndicator;
    viewCssClasses;
    editCssClasses;
    skipValidationOnSave;
    attachmentFields;
};
exports.Form = Form;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true, unique: true }),
    __metadata("design:type", String)
], Form.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Form.prototype, "customAngularApp", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Form.prototype, "fields", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('workflowStep'),
    __metadata("design:type", Object)
], Form.prototype, "workflowStep", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], Form.prototype, "type", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Form.prototype, "messages", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], Form.prototype, "requiredFieldIndicator", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], Form.prototype, "viewCssClasses", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], Form.prototype, "editCssClasses", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'boolean' }),
    __metadata("design:type", Boolean)
], Form.prototype, "skipValidationOnSave", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], Form.prototype, "attachmentFields", void 0);
exports.Form = Form = __decorate([
    (0, decorators_1.Entity)('form')
], Form);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9ybS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9Gb3JtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUErRDtBQUd4RCxJQUFNLElBQUksR0FBVixNQUFNLElBQUk7SUFFUixJQUFJLENBQVU7SUFHZCxnQkFBZ0IsQ0FBMkI7SUFHM0MsTUFBTSxDQUEyQjtJQUdqQyxZQUFZLENBQW1CO0lBRy9CLElBQUksQ0FBVTtJQUdkLFFBQVEsQ0FBMkI7SUFHbkMsc0JBQXNCLENBQVU7SUFHaEMsY0FBYyxDQUFVO0lBR3hCLGNBQWMsQ0FBVTtJQUd4QixvQkFBb0IsQ0FBVztJQUcvQixnQkFBZ0IsQ0FBMkI7Q0FDbkQsQ0FBQTtBQWpDWSxvQkFBSTtBQUVSO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7a0NBQ2xDO0FBR2Q7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzhDQUMyQjtBQUczQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7b0NBQ2lCO0FBR2pDO0lBRE4sSUFBQSxzQkFBUyxFQUFDLGNBQWMsQ0FBQzs7MENBQ1k7QUFHL0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O2tDQUNKO0FBR2Q7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7O3NDQUNtQjtBQUduQztJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQzs7b0RBQ2M7QUFHaEM7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7OzRDQUNNO0FBR3hCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDOzs0Q0FDTTtBQUd4QjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQzs7a0RBQ1k7QUFHL0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzhDQUMyQjtlQWhDdkMsSUFBSTtJQURoQixJQUFBLG1CQUFNLEVBQUMsTUFBTSxDQUFDO0dBQ0YsSUFBSSxDQWlDaEIifQ==