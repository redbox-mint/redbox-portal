import { RecordModel } from '../model/storage/RecordModel';

export type JsonMap = { [key: string]: unknown };

declare global {
	var Record: Sails.Model<RecordModel>;
}
