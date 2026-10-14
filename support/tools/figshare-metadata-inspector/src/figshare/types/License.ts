import { z } from 'zod';
import { FigshareIdentifierSchema } from './Identifier';

export const FigshareLicenseSchema = z
  .object({
    id: FigshareIdentifierSchema.optional(),
    value: FigshareIdentifierSchema.optional(),
    name: z.string(),
    url: z.string().optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (value.id == null && value.value == null) {
      context.addIssue({ code: 'custom', message: 'Licence has no id or value' });
    }
  });

export type FigshareLicenseApiResponse = z.infer<typeof FigshareLicenseSchema>;

export interface FigshareLicense extends FigshareLicenseApiResponse {
  id: string | number;
  raw: Record<string, unknown>;
}
