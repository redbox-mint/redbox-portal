// Adapted from https://git.f3l.de/ttomasini/sails-types/raw/branch/master/sails.d.ts
import { NextFunction } from "express";
import express = require("express");

declare global {
	namespace Sails {
		
	// Recursive type for nested config objects - using any for maximum flexibility
	export interface ConfigObject {
		[key: string]: any;
	}

	// Log interface based on https://github.com/balderdashy/captains-log
	export interface Log {
		crit: (message: string, ...args: any[]) => void;
		error: (message: string, ...args: any[]) => void;
		warn: (message: string, ...args: any[]) => void;
		debug: (message: string, ...args: any[]) => void;
		info: (message: string, ...args: any[]) => void;
		verbose: (message: string, ...args: any[]) => void;
		silly: (message: string, ...args: any[]) => void;
		blank: (message: string, ...args: any[]) => void;
	}

	export interface Application {
		config: ConfigObject;
		log: Log;
		services: {
			[key: string]: any;
		};
		models: {
			[key: string]: any;
		};
		after(events: string | string[], cb: () => void): void;
	}		export interface Hook {
			initialize: (cb: () => void) => void;
			routes: {
				before: { [key: string]: any };
				after: { [key: string]: any };
			};
			configure?: () => void;
			defaults?: { [key: string]: any };
		}

		export interface Model {
			attributes: Object;

			create(params: Object): WaterlinePromise<QueryResult>;
			create(params: Array<Object>): WaterlinePromise<QueryResult>;
			create(params: Object, cb: (err: Error, created: QueryResult) => void): void;
			create(params: Array<Object>, cb: (err: Error, created: Array<QueryResult>) => void): void;

			find(): QueryBuilder;
			find(params: Object): QueryBuilder;
			find(params: Object): WaterlinePromise<Array<QueryResult>>;

			findOne(criteria: Object): WaterlinePromise<QueryResult>;
			findOne(criteria: Object, cb: (err: Error, found: QueryResult) => void): void;

			count(criteria: Object): WaterlinePromise<number>;
			count(criteria: Array<Object>): WaterlinePromise<number>;
			count(criteria: string): WaterlinePromise<number>;
			count(criteria: number): WaterlinePromise<number>;

			count(criteria: Object, cb: (err: Error, found: number) => void);
			count(criteria: Array<Object>, cb: (err: Error, found: number) => void);
			count(criteria: string, cb: (err: Error, found: number) => void);
			count(criteria: number, cb: (err: Error, found: number) => void);

			destroy(criteria: Object): WaterlinePromise<Array<Record>>;
			destroy(criteria: Array<Object>): WaterlinePromise<Array<Record>>;
			destroy(criteria: string): WaterlinePromise<Array<Record>>;
			destroy(criteria: number): WaterlinePromise<Array<Record>>;

			destroy(criteria: Object, cb: (err: Error, deleted: Array<Record>) => void): void;
			destroy(criteria: Array<Object>, cb: (err: Error, deleted: Array<Record>) => void): void;
			destroy(criteria: string, cb: (err: Error, deleted: Array<Record>) => void): void;
			destroy(criteria: number, cb: (err: Error, deleted: Array<Record>) => void): void;

			update(criteria: Object, changes: Object): WaterlinePromise<Array<QueryResult>>;
			update(criteria: Array<Object>, changes: Object): WaterlinePromise<Array<QueryResult>>;
			update(criteria: string, changes: Object): WaterlinePromise<Array<QueryResult>>;
			update(criteria: number, changes: Object): WaterlinePromise<Array<QueryResult>>;

			update(criteria: Object, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;
			update(criteria: Array<Object>, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;
			update(criteria: string, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;
			update(criteria: number, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;

			update(criteria: Object, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>) => void): void;
			update(criteria: Array<Object>, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>) => void): void;
			update(criteria: string, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>) => void): void;
			update(criteria: number, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>) => void): void;

			// Overload for update without changes (chainable with .set())
			update(criteria: Object): WaterlinePromise<Array<QueryResult>>;

			query(sqlQuery: string, cb: (err: Error, results: Array<Record>) => void);
			native(cb: (err: Error, collection: Model) => void);

			stream(criteria: Object, writeEnd: Object): NodeJS.WritableStream;
			stream(criteria: Array<Object>, writeEnd: Object): NodeJS.WritableStream;
			stream(criteria: string, writeEnd: Object): NodeJS.WritableStream;
			stream(criteria: number, writeEnd: Object): NodeJS.WritableStream;

			stream(criteria: Object, writeEnd: Object): Error;
			stream(criteria: Array<Object>, writeEnd: Object): Error;
			stream(criteria: string, writeEnd: Object): Error;
			stream(criteria: number, writeEnd: Object): Error;

			addToCollection(id: string | number, association: string): { members: (ids: (string | number)[]) => WaterlinePromise<any> };
			replaceCollection(id: string | number, association: string): { members: (ids: (string | number)[]) => WaterlinePromise<any> };
			removeFromCollection(id: string | number, association: string): { members: (ids: (string | number)[]) => WaterlinePromise<any> };
		}

		export interface NextFunction extends express.NextFunction {}
		
		export interface Req extends express.Request {
			options?: any;
			[key: string]: any;
		 }

		export interface Res extends express.Response {
			attachement(filename: string);

			badRequest();
			badRequest(data: any);
			badRequest(data: any, pathToView: string);

			serverError();
			serverError(data: any);
			serverError(data: any, pathToView: string);

			view(route: string);
		}

		export type Policy = (req: Req, res: Res, next: NextFunction) => Promise<void> | void;

		export class WaterlinePromise<T> extends Promise<T> {
			exec(cb: (err: Error, results: Array<QueryResult>) => void): any;
			exec(cb: (err: Error, result: QueryResult) => void): any;
			
			populate(association: string): WaterlinePromise<T>;
			populate(association: string, filter: Object): WaterlinePromise<T>;
			set(values: Object): WaterlinePromise<T>;
		}

		export class Record {
			id: number;
			createdAt: Date;
			updatedAt: Date;
			[key: string]: any;
		}

		export class QueryResult extends Record {
			destroy(): Promise<Array<Sails.QueryResult>>;

			toJSON(): Object;
		}

		export class QueryBuilder extends Promise<any> {
			exec(cb: (error: any, results: Array<QueryResult>) => void);

			where(condition: Object): QueryBuilder;

			meta(options: {
				fetch?: boolean;
				cascade?: boolean;
				skipAllLifecycleCallbacks?: boolean;
				skipRecordVerification?: boolean;
				skipExpandingDefaultSelectClause?: boolean;
				decrypt?: boolean;
				encryptWith?: string;
				makeLikeModifierCaseInsensitive?: boolean;
				enableExperimentalDeepTargets?: boolean;
				[key: string]: any;
			}): QueryBuilder;

			limit(lim: number): QueryBuilder;

			skip(num: number): QueryBuilder;

			sort(criteria: string): QueryBuilder;

			populate(association: string): QueryBuilder;
			populate(association: string, filter: Object): QueryBuilder;
		}

		export interface Controller { }
	}
}

export {}; // Ensure the file is treated as a module
