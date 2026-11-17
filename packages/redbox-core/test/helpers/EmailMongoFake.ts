import { ObjectId } from 'mongodb';

/** Small native-Mongo dialect fake; real races/indexes are covered by the integration suite. */
export class EmailMongoFake {
  stores = new Map<string, Map<string, any>>();
  collections = new Map<string, any>();
  constructor(public live = new Map<string, any>()) {
    this.stores.set('emailtemplate', live);
  }
  key(name: string, row: any) {
    if (name === 'emailtemplatedraftrevision') return String(row._id);
    return JSON.stringify(
      ['emailtemplatehistory', 'emailtemplatereconciliation'].includes(name) ? [row.brandId, row.templateId, row.version] : [row.brandId, row.templateId]
    );
  }
  matches(row: any, criteria: any) {
    return Object.entries(criteria).every(([key, value]: any) =>
      value && typeof value === 'object' && '$in' in value
        ? value.$in.includes(row[key])
        : key === '_id'
          ? String(row._id ?? row.id) === String(value)
          : row[key] === value
    );
  }
  native(row: any) {
    if (!row) return null;
    const { id, ...rest } = row;
    return { ...rest, _id: row._id ?? (id ? new ObjectId(id) : new ObjectId()) };
  }
  collection = (name: string) => {
    if (this.collections.has(name)) return this.collections.get(name);
    const store = this.stores.get(name) ?? new Map();
    this.stores.set(name, store);
    const read = (criteria: any) => [...store.values()].filter(row => this.matches(row, criteria));
    const save = (row: any) => {
      const normalized = name === 'emailtemplate' ? { ...row, id: String(row._id) } : row;
      store.set(this.key(name, row), normalized);
    };
    const collection = {
      createIndex: async () => 'index',
      insertOne: async (row: any) => {
        const key = this.key(name, row);
        if (store.has(key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
        row._id ??= new ObjectId();
        save(row);
        return { insertedId: row._id };
      },
      findOne: async (criteria: any, opts?: any) => {
        const rows = read(criteria);
        if (opts?.sort) rows.sort((a, b) => b.version - a.version);
        return this.native(rows[0]);
      },
      find: (criteria: any) => {
        let sort: any;
        return {
          sort(value: any) {
            sort = value;
            return this;
          },
          toArray: async () => {
            const rows = read(criteria).map(row => this.native(row));
            if (sort) rows.sort((a, b) => (a.version - b.version) * sort.version);
            return rows;
          },
        };
      },
      findOneAndUpdate: async (criteria: any, update: any, options?: any) => {
        let row = read(criteria)[0];
        if (!row && !options?.upsert) return null;
        row = { ...(row ?? criteria), ...update.$set };
        for (const [field, increment] of Object.entries(update.$inc ?? {}))
          row[field] = (row[field] ?? 0) + Number(increment);
        row._id ??= new ObjectId();
        save(row);
        return this.native(row);
      },
      deleteOne: async (criteria: any) => {
        const row = read(criteria)[0];
        if (row) store.delete(this.key(name, row));
        return { deletedCount: row ? 1 : 0 };
      },
      deleteMany: async (criteria: any) => {
        const rows = read(criteria);
        for (const row of rows) store.delete(this.key(name, row));
        return { deletedCount: rows.length };
      },
    };
    this.collections.set(name, collection);
    return collection;
  };
  datastore = () => ({ driver: { mongodb: { ObjectId } }, manager: { collection: this.collection } });
}
