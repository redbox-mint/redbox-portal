/** Private document operations for the existing record lifecycle protocol.
 * No driver handles, sessions or BSON values cross the storage capability contract.
 */
import type { Document, SortDirection } from 'mongodb';
export interface RecordDocuments {
  findOne(where: Document): Promise<Document | null>;
  list<T = Document>(
    where: Document,
    options?: { sort?: Record<string, SortDirection>; skip?: number; limit?: number; projection?: Document }
  ): Promise<T[]>;
  insertOne(values: Document): Promise<unknown>;
  findOneAndUpdate(where: Document, update: Document | Document[], options?: Document): Promise<Document | null>;
  findOneAndDelete(where: Document, options?: Document): Promise<Document | null>;
  updateOne(where: Document, update: Document | Document[]): Promise<{ matchedCount: number }>;
  updateMany(where: Document, update: Document | Document[]): Promise<{ modifiedCount: number }>;
  deleteOne(where: Document): Promise<unknown>;
  count(where: Document): Promise<number>;
}
