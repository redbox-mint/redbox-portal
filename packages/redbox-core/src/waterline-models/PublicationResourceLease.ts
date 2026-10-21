/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import type { PublicationResourceLeaseModel } from '../model/storage/PublicationResourceLeaseModel';

/** Native store owns compound indexes and conditional resource ownership. */
@Entity('publicationresourcelease')
export class PublicationResourceLeaseClass implements PublicationResourceLeaseModel {
  @Attr({ type: 'number', required: true }) public schemaVersion!: 1;
  @Attr({ type: 'string', required: true }) public providerId!: string;
  @Attr({ type: 'string', required: true }) public namespace!: string;
  @Attr({ type: 'string', required: true }) public resourceKey!: string;
  @Attr({ type: 'number' }) public revision!: number;
  @Attr({ type: 'json' }) public lease!: PublicationResourceLeaseModel['lease'];
  @Attr({ type: 'json' }) public operations!: PublicationResourceLeaseModel['operations'];
}
export const PublicationResourceLeaseWLDef = toWaterlineModelDef(PublicationResourceLeaseClass);
