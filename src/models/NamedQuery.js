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
exports.NamedQuery = void 0;
const decorators_1 = require("../../lib/decorators");
const setKey = (namedQuery, cb) => {
    namedQuery.key = `${namedQuery.branding}_${namedQuery.name}`;
    cb();
};
let NamedQuery = class NamedQuery {
    key;
    name;
    branding;
    mongoQuery;
    queryParams;
    collectionName;
    resultObjectMapping;
    brandIdFieldPath;
};
exports.NamedQuery = NamedQuery;
__decorate([
    (0, decorators_1.Attr)({ type: 'string', unique: true }),
    __metadata("design:type", String)
], NamedQuery.prototype, "key", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], NamedQuery.prototype, "name", void 0);
__decorate([
    (0, decorators_1.BelongsTo)('brandingconfig', { required: true }),
    __metadata("design:type", Object)
], NamedQuery.prototype, "branding", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], NamedQuery.prototype, "mongoQuery", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], NamedQuery.prototype, "queryParams", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], NamedQuery.prototype, "collectionName", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string', required: true }),
    __metadata("design:type", String)
], NamedQuery.prototype, "resultObjectMapping", void 0);
__decorate([
    (0, decorators_1.Attr)({ type: 'string' }),
    __metadata("design:type", String)
], NamedQuery.prototype, "brandIdFieldPath", void 0);
exports.NamedQuery = NamedQuery = __decorate([
    (0, decorators_1.BeforeCreate)(setKey),
    (0, decorators_1.Entity)('namedquery')
], NamedQuery);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmFtZWRRdWVyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3R5cGVzY3JpcHQvc3JjL21vZGVscy9OYW1lZFF1ZXJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLHFEQUE2RTtBQUU3RSxNQUFNLE1BQU0sR0FBRyxDQUFDLFVBQStCLEVBQUUsRUFBeUIsRUFBRSxFQUFFO0lBQzVFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxVQUFVLENBQUMsUUFBUSxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM3RCxFQUFFLEVBQUUsQ0FBQztBQUNQLENBQUMsQ0FBQztBQUlLLElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVU7SUFFZCxHQUFHLENBQVU7SUFHYixJQUFJLENBQVU7SUFHZCxRQUFRLENBQW1CO0lBRzNCLFVBQVUsQ0FBVTtJQUdwQixXQUFXLENBQVU7SUFHckIsY0FBYyxDQUFVO0lBR3hCLG1CQUFtQixDQUFVO0lBRzdCLGdCQUFnQixDQUFVO0NBQ2xDLENBQUE7QUF4QlksZ0NBQVU7QUFFZDtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDOzt1Q0FDbkI7QUFHYjtJQUROLElBQUEsaUJBQUksRUFBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDOzt3Q0FDcEI7QUFHZDtJQUROLElBQUEsc0JBQVMsRUFBQyxnQkFBZ0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7NENBQ2Q7QUFHM0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7OENBQ2Q7QUFHcEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7K0NBQ2I7QUFHckI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7a0RBQ1Y7QUFHeEI7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQzs7dURBQ0w7QUFHN0I7SUFETixJQUFBLGlCQUFJLEVBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7O29EQUNRO3FCQXZCdEIsVUFBVTtJQUZ0QixJQUFBLHlCQUFZLEVBQUMsTUFBTSxDQUFDO0lBQ3BCLElBQUEsbUJBQU0sRUFBQyxZQUFZLENBQUM7R0FDUixVQUFVLENBd0J0QiJ9