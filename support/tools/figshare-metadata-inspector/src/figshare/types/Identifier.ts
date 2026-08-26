import { z } from 'zod';

export const FigshareIdentifierSchema = z.union([z.string(), z.number()]);
