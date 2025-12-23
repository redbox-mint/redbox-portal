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
exports.User = void 0;
const decorators_1 = require("../../lib/decorators");
const customToJSON = function customToJSON() {
    const obj = {};
    if (typeof _ !== 'undefined' && _ && typeof _.assign === 'function') {
        _.assign(obj, this);
        if (typeof _.unset === 'function') {
            _.unset(obj, 'password');
        }
        else {
            delete obj.password;
        }
    }
    else {
        Object.assign(obj, this);
        delete obj.password;
    }
    return obj;
};
const assignAccessToPendingRecords = function assignAccessToPendingRecords(user) {
    try {
        if (user.email != null && user.name !== 'Local Admin') {
            UsersService.findAndAssignAccessToRecords(user.email, user.username);
        }
    }
    catch (error) {
        if (typeof sails !== 'undefined' && sails.log && typeof sails.log.error === 'function') {
            sails.log.error('Unable to assign access to pending records');
            sails.log.error(error);
        }
    }
};
const hashPassword = (user, cb) => {
    if (!user.password) {
        return cb();
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bcryptLib = require('bcryptjs');
    bcryptLib.genSalt(10, (err, salt) => {
        if (err) {
            sails.log.error(err);
            return cb(err);
        }
        bcryptLib.hash(user.password, salt, (hashErr, hash) => {
            if (hashErr) {
                sails.log.error(hashErr);
                return cb(hashErr);
            }
            user.password = hash;
            return cb();
        });
    });
};
const handleAfterMutation = (user, cb) => {
    const userModel = typeof globalThis !== 'undefined' ? globalThis.User : undefined;
    if (userModel && typeof userModel.assignAccessToPendingRecords === 'function') {
        userModel.assignAccessToPendingRecords(user);
    }
    cb();
};
let User = class User {
    username;
    password;
    lastLogin;
    type;
    name;
    email;
    token;
    additionalAttributes;
    workspaceApps;
    roles;
};
exports.User = User;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], User.prototype, "password", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', columnType: 'datetime' }),
    __metadata("design:type", String)
], User.prototype, "lastLogin", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], User.prototype, "type", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], User.prototype, "name", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], User.prototype, "token", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'json' }),
    __metadata("design:type", Object)
], User.prototype, "additionalAttributes", void 0);
__decorate([
    (0, decorators_1.HasMany)('workspaceApp', 'user'),
    __metadata("design:type", Array)
], User.prototype, "workspaceApps", void 0);
__decorate([
    (0, decorators_1.HasMany)('role', 'users', { dominant: true }),
    __metadata("design:type", Array)
], User.prototype, "roles", void 0);
exports.User = User = __decorate([
    (0, decorators_1.AfterUpdate)(handleAfterMutation),
    (0, decorators_1.AfterCreate)(handleAfterMutation),
    (0, decorators_1.BeforeCreate)(hashPassword),
    (0, decorators_1.Entity)('user', {
        customToJSON,
        assignAccessToPendingRecords,
    })
], User);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXNlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9Vc2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQU84QjtBQU05QixNQUFNLFlBQVksR0FBRyxTQUFTLFlBQVk7SUFDeEMsTUFBTSxHQUFHLEdBQTRCLEVBQUUsQ0FBQztJQUN4QyxJQUFJLE9BQU8sQ0FBQyxLQUFLLFdBQVcsSUFBSSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsTUFBTSxLQUFLLFVBQVUsRUFBRSxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BCLElBQUksT0FBTyxDQUFDLENBQUMsS0FBSyxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNCLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBUSxHQUErQixDQUFDLFFBQVEsQ0FBQztRQUNuRCxDQUFDO0lBQ0gsQ0FBQztTQUFNLENBQUM7UUFDTixNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QixPQUFRLEdBQStCLENBQUMsUUFBUSxDQUFDO0lBQ25ELENBQUM7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNiLENBQUMsQ0FBQztBQUVGLE1BQU0sNEJBQTRCLEdBQUcsU0FBUyw0QkFBNEIsQ0FBQyxJQUF5QjtJQUNsRyxJQUFJLENBQUM7UUFDSCxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDdEQsWUFBWSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFL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