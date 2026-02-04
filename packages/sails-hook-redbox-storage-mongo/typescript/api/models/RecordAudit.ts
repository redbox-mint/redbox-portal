import 'reflect-metadata';
import { Entity, Attr, toWaterlineModelDef } from '@researchdatabox/redbox-core-types';

@Entity('recordaudit', { datastore: 'redboxStorage' })
export class RecordAuditClass {
    @Attr({ type: 'json' })
    public user?: Record<string, unknown>;

    @Attr({ type: 'json' })
    public record?: Record<string, unknown>;

    @Attr({ type: 'string', autoCreatedAt: true })
    public dateCreated!: string;

    @Attr({ type: 'string' })
    public action?: string;
}

// Export the Waterline model definition for runtime use
export const RecordAuditWLDef = toWaterlineModelDef(RecordAuditClass);
