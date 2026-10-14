export class RecordAuditModel {
    occurredAt?: string;
    redboxOid: string;
    action:RecordAuditActionType;
    user: Record<string, unknown> | null;
    record: Record<string, unknown>;

    constructor(oid: string, record: Record<string, unknown>, user: Record<string, unknown> | null, action: RecordAuditActionType = RecordAuditActionType.updated) {
        if (user!= null && !_.isEmpty(user.password)) {
            delete user.password;
        }
        this.redboxOid = oid;
        this.record = record;
        this.user = user;
        this.action = action;
        this.occurredAt = getRecordAuditTimestamp({ action, record }) ?? new Date().toISOString();
    }
}

export enum RecordAuditActionType {
    created = 'created',
    updated = 'updated',
    deleted = 'deleted',
    destroyed = 'destroyed',
    restored = 'restored'
}

/** Resolve event time, preserving insertion time only as a legacy fallback. */
export function getRecordAuditTimestamp(audit: Record<string, unknown>): string | null {
    const snapshot = audit['record'];
    const record = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : {};
    const metadata = record['metaMetadata'];
    const meta = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
    const candidates: unknown[] = [audit['occurredAt']];
    if (audit['action'] === RecordAuditActionType.updated) {
        // Partial writes update only the top-level date; full-save snapshots may carry a newer metadata date.
        const saveDates = [meta['lastSaveDate'], record['lastSaveDate']]
            .filter((value): value is string => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value)))
            .sort((a, b) => Date.parse(b) - Date.parse(a));
        candidates.push(...saveDates);
    } else if (audit['action'] === RecordAuditActionType.created) {
        candidates.push(meta['createdOn'], record['dateCreated']);
    }
    candidates.push(audit['createdAt'], audit['updatedAt'], audit['dateCreated']);
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Date.parse(candidate))) {
            return candidate;
        }
    }
    return null;
}
