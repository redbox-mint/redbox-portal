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
    const bcryptLib = (() => {
        try {
            return require('bcrypt');
        }
        catch (error) {
            if (typeof sails !== 'undefined' && sails.log && typeof sails.log.warn === 'function') {
                sails.log.warn('Falling back to bcryptjs due to error loading bcrypt', error);
            }
            return require('bcryptjs');
        }
    })();
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