import { InjectionToken } from '@angular/core';
import type {
  GridCatalogue,
  GridListPage,
  GridDefinition,
  GridPage,
  GridQuery,
  GridScope,
  SavedQuery,
} from './data-grid.model';

/** Authenticated discovery, collection and optional persistence boundary. */
export interface DataGridSource {
  schema?(): Promise<string>;
  raw?(document: string, variables: object): Promise<Record<string, unknown>>;
  generate?(request: GridQuery): Promise<{ query: string; variables: object }>;
  stages?(scope: GridScope): Promise<GridScope[]>;
  fields?(scope: GridScope): Promise<GridScope[]>;
  catalogue(): Promise<GridCatalogue>;
  read(id: string): Promise<SavedQuery>;
  remove(definition: SavedQuery): Promise<void>;
  list(after?: string): Promise<GridListPage>;
  query(request: GridQuery): Promise<GridPage>;
  save(definition: SavedQuery): Promise<SavedQuery>;
}
export class GridRequestError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}
export class GridSourceUnavailable extends Error {}
const unavailable = async (): Promise<never> => {
  throw new GridSourceUnavailable();
};

export const DATA_GRID_SOURCE = new InjectionToken<DataGridSource>('DATA_GRID_SOURCE', {
  providedIn: 'root',
  factory: () => ({
    catalogue: unavailable,
    list: unavailable,
    query: unavailable,
    save: unavailable,
    read: unavailable,
    remove: unavailable,
  }),
});
