// Adapted from https://git.f3l.de/ttomasini/sails-types/raw/branch/master/sails.d.ts
import { NextFunction } from "express";
import express = require("express");
import type { SailsConfig } from "./config";

declare global {
	var sails: Sails.Application;

	namespace Sails {

		// Re-export SailsConfig for use in config typing
		export { SailsConfig };

		// ConfigObject now extends SailsConfig for typed access
		export interface ConfigObject extends SailsConfig {
			// Passport is configured at runtime during bootstrap.
			passport: any;
		}

		// Log interface based on https://github.com/balderdashy/captains-log
		export interface Log {
			crit: (...args: any[]) => void;
			error: (...args: any[]) => void;
			warn: (...args: any[]) => void;
			debug: (...args: any[]) => void;
			info: (...args: any[]) => void;
			verbose: (...args: any[]) => void;
			silly: (...args: any[]) => void;
			blank: (...args: any[]) => void;
			trace: (...args: any[]) => void;
			log: (...args: any[]) => void;
			fatal: (...args: any[]) => void;
			silent: (...args: any[]) => void;
			[key: string]: (...args: any[]) => void;
		}

		export interface Application {
			config: ConfigObject;
			log: Log;
			services: {
				[key: string]: any;
			};
			after(events: string | string[], cb: () => void): void;
			// Socket.io sockets interface
			sockets: {
				join(req: any, room: string, cb?: (err?: Error) => void): void;
				leave(req: any, room: string, cb?: (err?: Error) => void): void;
				broadcast(room: string, event: string, data?: any, socketToOmit?: any): void;
				blast(event: string, data?: any): void;
				getId(req: any): string;
				[key: string]: any;
			};
			// Action lookup method
			getActions(): { [actionName: string]: any };
            on(event: string, cb: (...args: any[]) => void): void;
            emit(event: string, ...args: any[]): void;
		}		export interface Hook {
			initialize: (cb: () => void) => void;
			routes: {
				before: { [key: string]: any };
				after: { [key: string]: any };
			};
			configure?: () => void;
			defaults?: { [key: string]: any };
		}

		export interface Model<T> {
			attributes: Object;

			create(params: Object): WaterlinePromise<QueryResult>;
			create(params: Array<Object>): WaterlinePromise<QueryResult>;
			create(params: Object, cb: (err: Error, created: QueryResult) => void): void;
			create(params: Array<Object>, cb: (err: Error, created: Array<QueryResult>) => void): void;

			find(): QueryBuilder;
			find(params: Object): QueryBuilder;
			find(params: Object): WaterlinePromise<Array<QueryResult>>;

			findOne(criteria: Object): WaterlinePromise<T>;
			findOne(criteria: Object, cb: (err: Error, found: T) => void): void;

			findOrCreate(criteria: Object, values: Object): WaterlinePromise<T>;
			findOrCreate(criteria: Object, values: Object, cb: (err: Error, found: T) => void): void;

			count(): WaterlinePromise<number>;
			count(criteria: Object): WaterlinePromise<number>;
			count(criteria: Array<Object>): WaterlinePromise<number>;
			count(criteria: string): WaterlinePromise<number>;
			count(criteria: number): WaterlinePromise<number>;

			count(criteria: Object, cb: (err: Error, found: number) => void): void;
			count(criteria: Array<Object>, cb: (err: Error, found: number) => void): void;
			count(criteria: string, cb: (err: Error, found: number) => void): void;
			count(criteria: number, cb: (err: Error, found: number) => void): void;

			destroy(criteria: Object): WaterlinePromise<Array<Record>>;
			destroy(criteria: Array<Object>): WaterlinePromise<Array<Record>>;
			destroy(criteria: string): WaterlinePromise<Array<Record>>;
			destroy(criteria: number): WaterlinePromise<Array<Record>>;

			destroy(criteria: Object, cb: (err: Error, deleted: Array<Record>) => void): void;
			destroy(criteria: Array<Object>, cb: (err: Error, deleted: Array<Record>) => void): void;
			destroy(criteria: string, cb: (err: Error, deleted: Array<Record>) => void): void;
			destroy(criteria: number, cb: (err: Error, deleted: Array<Record>) => void): void;

			destroyOne(criteria: Object): WaterlinePromise<T>;
			destroyOne(criteria: string): WaterlinePromise<T>;
			destroyOne(criteria: number): WaterlinePromise<T>;

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

			updateOne(criteria: Object, changes: Object): WaterlinePromise<T>;
			updateOne(criteria: Object): WaterlinePromise<T>;
			updateOne(criteria: string, changes: Object): WaterlinePromise<T>;
			updateOne(criteria: string): WaterlinePromise<T>;
			updateOne(criteria: number, changes: Object): WaterlinePromise<T>;
			updateOne(criteria: number): WaterlinePromise<T>;

			query(sqlQuery: string, cb: (err: Error, results: Array<Record>) => void): void;
			native(cb: (err: Error, collection: Model<T>) => void): void;

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
            getDatastore(): { manager: any };
		}

		export interface WaterlineAttributes {
			id: string;
		}

		export interface NextFunction extends express.NextFunction { }

		export interface Req extends express.Request {
			options?: any;
			session: any;
			user?: any;
			query: { [key: string]: any };
			param(name: string, defaultValue?: any): any;
			isAuthenticated(): this is Express.AuthenticatedRequest;
			[key: string]: any;
		}

		// Sails.js Response interface - uses intersection type to add Sails-specific methods
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		export interface Res extends Omit<express.Response, 'badRequest'> {
			attachement(filename: string): void;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			badRequest(data?: any, pathToView?: string): any;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			serverError(data?: any, pathToView?: string): any;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			notFound(data?: any, pathToView?: string): any;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			view(route: string, options?: any): void;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			guessView(options: any, cb: () => void): void;
		}

		export type Policy = (req: Req, res: Res, next: NextFunction) => Promise<void> | void;

		export class WaterlinePromise<T> extends Promise<T> {
			exec(cb: (err: Error, results: T) => void): void;
			set(values: Object): WaterlinePromise<T>;
			meta(options: Object): WaterlinePromise<T>;

			populate(association: string): QueryBuilder;
			populate(association: string, filter: Object): QueryBuilder;
		}

		export class Record {
			id: number;
			createdAt: Date;
			updatedAt: Date;
		}

		export class QueryResult extends Record {
			destroy(): Promise<Array<Sails.QueryResult>>;

			toJSON(): Object;
		}

		export class QueryBuilder extends Promise<any> {
			exec(cb: (error: any, results: Array<QueryResult>) => void): void;
			set(values: Object): QueryBuilder;
			meta(options: Object): QueryBuilder;

			where(condition: Object): QueryBuilder;

			limit(lim: number): QueryBuilder;

			skip(num: number): QueryBuilder;

			sort(criteria: string): QueryBuilder;

			populate(association: string): QueryBuilder;
			populate(association: string, filter: Object): QueryBuilder;
		}

		export interface Controller { }
	}
}

// Export type alias for use in TypeScript files
// Use: import type { Sails } from '@researchdatabox/redbox-core-types';
// Or:  export type SailsApplication = Sails.Application;

export { }; // Ensure the file is treated as a module
