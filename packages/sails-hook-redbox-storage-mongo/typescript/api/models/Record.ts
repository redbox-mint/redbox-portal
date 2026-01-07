import 'reflect-metadata';
import { Entity, Attr, toWaterlineModelDef } from '@researchdatabox/redbox-core-types';

export type JsonMap = Record<string, unknown>;

@Entity('record', {
    datastore: 'redboxStorage',
})
export class RecordClass {
    @Attr({ type: 'string', unique: true })
    public redboxOid?: string;

    @Attr({ type: 'string' })
    public harvestId?: string;

    @Attr({ type: 'json' })
    public metaMetadata?: JsonMap;

    @Attr({ type: 'json' })
    public metadata?: JsonMap;

    @Attr({ type: 'json' })
    public workflow?: JsonMap;

    @Attr({ type: 'json' })
    public authorization?: JsonMap;

    @Attr({ type: 'string', autoCreatedAt: true })
    public dateCreated!: string;

    @Attr({ type: 'string', autoUpdatedAt: true })
    public lastSaveDate!: string;
}

// Export the Waterline model definition for runtime use
export const RecordWLDef = toWaterlineModelDef(RecordClass);
