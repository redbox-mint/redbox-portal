import { z } from 'zod';
import { FigshareIdentifierSchema } from './Identifier';

export const FigshareCategorySchema = z
  .object({
    id: FigshareIdentifierSchema,
    title: z.string().optional(),
    name: z.string().optional(),
    parent_id: FigshareIdentifierSchema.nullish(),
    path: z.string().optional(),
    source_id: FigshareIdentifierSchema.optional(),
    taxonomy_id: FigshareIdentifierSchema.optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (value.title == null && value.name == null) {
      context.addIssue({ code: 'custom', message: 'Category has no title or name' });
    }
  });

export type FigshareCategoryApiResponse = z.infer<typeof FigshareCategorySchema>;

export interface FigshareCategory extends FigshareCategoryApiResponse {
  title: string;
  raw: Record<string, unknown>;
}
