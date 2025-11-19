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
exports.WorkspaceApp = void 0;
const decorators_1 = require("../../lib/decorators");
let WorkspaceApp = class WorkspaceApp {
    app;
    user;
    info;
};
exports.WorkspaceApp = WorkspaceApp;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], WorkspaceApp.prototype, "app", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('user', { required: true }),
    __metadata("design:type", Object)
], WorkspaceApp.prototype, "user", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], WorkspaceApp.prototype, "info", void 0);
exports.WorkspaceApp = WorkspaceApp = __decorate([
    (0, decorators_1.Entity)('workspaceapp', {
        indexes: [
            {
                attributes: {
                    app: 1,
                    user: 1,
                },
                options: {
                    unique: true,
                },
            },
        ],
    })
], WorkspaceApp);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV29ya3NwYWNlQXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdHlwZXNjcmlwdC9zcmMvbW9kZWxzL1dvcmtzcGFjZUFwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxxREFBK0Q7QUFleEQsSUFBTSxZQUFZLEdBQWxCLE1BQU0sWUFBWTtJQUVoQixHQUFHLENBQVU7SUFHYixJQUFJLENBQW1CO0lBR3ZCLElBQUksQ0FBMkI7Q0FDdkMsQ0FBQTtBQVRZLG9DQUFZO0FBRWhCO0lBRE4sSUFBQSxpQkFBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7O3lDQUNyQjtBQUdiO0lBRE4sSUFBQSxzQkFBUyxFQUFDLE1BQU0sRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7MENBQ1I7QUFHdkI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7OzBDQUNlO3VCQVIzQixZQUFZO0lBYnhCLElBQUEsbUJBQU0sRUFBQyxjQUFjLEVBQUU7UUFDdEIsT0FBTyxFQUFFO1lBQ1A7Z0JBQ0UsVUFBVSxFQUFFO29CQUNWLEdBQUcsRUFBRSxDQUFDO29CQUNOLElBQUksRUFBRSxDQUFDO2lCQUNSO2dCQUNELE9BQU8sRUFBRTtvQkFDUCxNQUFNLEVBQUUsSUFBSTtpQkFDYjthQUNGO1NBQ0Y7S0FDRixDQUFDO0dBQ1csWUFBWSxDQVN4QiJ9