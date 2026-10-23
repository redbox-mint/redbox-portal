import type { AttachmentAuditInput } from '../../persistence/storage/PrismaAttachments';
import { retainHttpRequestFollowup } from '../../middleware/requestLifetime';

export function sailsAttachmentAudit(app: Sails.Application): AttachmentAuditInput {
  return {
    log: app.log,
    emitAccessEvent: event =>
      typeof SecurityEventService === 'undefined'
        ? Promise.resolve()
        : SecurityEventService.emitFromAttachmentAudit(event),
    retainFollowup: work => retainHttpRequestFollowup(app, work),
  };
}
