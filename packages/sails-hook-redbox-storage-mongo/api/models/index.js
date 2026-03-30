"use strict";
/**
 * MongoDB Storage Models
 *
 * This module exports Waterline model definitions for models that use
 * the MongoDB storage datastore (redboxStorage).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoModels = void 0;
const Record_1 = require("./Record");
const DeletedRecord_1 = require("./DeletedRecord");
const RecordAudit_1 = require("./RecordAudit");
// Re-export individual model definitions
__exportStar(require("./Record"), exports);
__exportStar(require("./DeletedRecord"), exports);
__exportStar(require("./RecordAudit"), exports);
// Consolidated Models map for hook registration
exports.MongoModels = {
    Record: Record_1.RecordWLDef,
    DeletedRecord: DeletedRecord_1.DeletedRecordWLDef,
    RecordAudit: RecordAudit_1.RecordAuditWLDef,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L2FwaS9tb2RlbHMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOzs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHFDQUF1QztBQUN2QyxtREFBcUQ7QUFDckQsK0NBQWlEO0FBRWpELHlDQUF5QztBQUN6QywyQ0FBeUI7QUFDekIsa0RBQWdDO0FBQ2hDLGdEQUE4QjtBQUU5QixnREFBZ0Q7QUFDbkMsUUFBQSxXQUFXLEdBQUc7SUFDdkIsTUFBTSxFQUFFLG9CQUFXO0lBQ25CLGFBQWEsRUFBRSxrQ0FBa0I7SUFDakMsV0FBVyxFQUFFLDhCQUFnQjtDQUNoQyxDQUFDIn0=