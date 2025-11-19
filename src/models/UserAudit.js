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
exports.UserAudit = void 0;
const decorators_1 = require("../../lib/decorators");
let UserAudit = class UserAudit {
    user;
    action;
    additionalContext;
};
exports.UserAudit = UserAudit;
__decorate([
    (0, decorators_1.Attr)({ type: 'json', required: true }),
    __metadata("design:type", Object)
], UserAudit.prototype, "user", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], UserAudit.prototype, "action", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], UserAudit.prototype, "additionalContext", void 0);
exports.UserAudit = UserAudit = __decorate([
    (0, decorators_1.Entity)('useraudit')
], UserAudit);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXNlckF1ZGl0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL1VzZXJBdWRpdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBb0Q7QUFHN0MsSUFBTSxTQUFTLEdBQWYsTUFBTSxTQUFTO0lBRWIsSUFBSSxDQUEyQjtJQUcvQixNQUFNLENBQVU7SUFHaEIsaUJBQWlCLENBQTJCO0NBQ3BELENBQUE7QUFUWSw4QkFBUztBQUViO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O3VDQUNEO0FBRy9CO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O3lDQUNsQjtBQUdoQjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQzs7b0RBQzRCO29CQVJ4QyxTQUFTO0lBRHJCLElBQUEsbUJBQU0sRUFBQyxXQUFXLENBQUM7R0FDUCxTQUFTLENBU3JCIn0=