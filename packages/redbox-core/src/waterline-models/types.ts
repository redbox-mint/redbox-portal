import { RecordModel } from '../model/storage/RecordModel';

export type JsonMap = { [key: string]: unknown };

declare global {
	const Record: Sails.Model<RecordModel>;
}
