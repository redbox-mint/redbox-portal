import { z } from 'zod';
import { FigshareIdentifierSchema } from './Identifier';

const FigshareCustomFieldBaseSchema = z
  .object({
    name: z.string().min(1),
    field_type: z.string().min(1),
    is_mandatory: z.boolean(),
    order: z.number().optional(),
    settings: z.unknown().optional(),
  })
  .passthrough();

/** Institution-level custom fields include a stable numeric Figshare identifier. */
export const FigshareInstitutionCustomFieldSchema = FigshareCustomFieldBaseSchema.extend({
  id: FigshareIdentifierSchema,
});

/**
 * Effective group metadata omits field ids, but includes inherited institution
 * fields and fields configured directly on the selected group.
 */
export const FigshareGroupMetadataFieldSchema = FigshareCustomFieldBaseSchema.extend({
  value: z.unknown().optional(),
});

export type FigshareInstitutionCustomFieldApiResponse = z.infer<typeof FigshareInstitutionCustomFieldSchema>;
export type FigshareGroupMetadataFieldApiResponse = z.infer<typeof FigshareGroupMetadataFieldSchema>;

export interface FigshareInstitutionCustomField extends FigshareInstitutionCustomFieldApiResponse {
  raw: Record<string, unknown>;
}

export interface FigshareGroupMetadataField extends FigshareGroupMetadataFieldApiResponse {
  raw: Record<string, unknown>;
}
