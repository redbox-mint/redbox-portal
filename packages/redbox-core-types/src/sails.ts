// Adapted from https://git.f3l.de/ttomasini/sails-types/raw/branch/master/sails.d.ts
import express = require("express");
import type { SailsConfig } from "./config";

// Augment express-session to include Sails-specific session properties
declare module "express-session" {
	interface SessionData {
		branding: string;
		portal: string;
		user: globalThis.Record<string, unknown>;
		redirUrl: string;
		logoutUrl: string;
		lang: string;
		authenticated: boolean;
		data: unknown;
	}
}

declare global {
	let sails: Sails.Application;

	namespace Sails {

		// Re-export SailsConfig for use in config typing
		export { SailsConfig };

		// ConfigObject now extends SailsConfig for typed access
		export interface ConfigObject extends SailsConfig {
			// Sails runtime config keys not covered by SailsConfig
			keepResponseErrors?: boolean;
			hooks: globalThis.Record<string, unknown>;
			[key: string]: unknown;
		}

		// Log interface based on https://github.com/balderdashy/captains-log
		export interface Log {
			crit: (...args: unknown[]) => void;
			error: (...args: unknown[]) => void;
			warn: (...args: unknown[]) => void;
			debug: (...args: unknown[]) => void;
			info: (...args: unknown[]) => void;
			verbose: (...args: unknown[]) => void;
			silly: (...args: unknown[]) => void;
			blank: (...args: unknown[]) => void;
			trace: (...args: unknown[]) => void;
			log: (...args: unknown[]) => void;
			fatal: (...args: unknown[]) => void;
			silent: (...args: unknown[]) => void;
			[key: string]: (...args: unknown[]) => void;
		}

		// Represents a dynamically-loaded Sails service with callable methods
		export interface DynamicService {
			[method: string]: (...args: unknown[]) => unknown;
		}

		export interface Application {
			config: ConfigObject;
			log: Log;
			services: {
				[key: string]: DynamicService;
			};
			after(events: string | string[], cb: () => void): void;
			// Socket.io sockets interface
			sockets: {
				join(req: unknown, room: string, cb?: (err?: Error) => void): void;
				leave(req: unknown, room: string, cb?: (err?: Error) => void): void;
				broadcast(room: string, event: string, data?: unknown, socketToOmit?: unknown): void;
				blast(event: string, data?: unknown): void;
				getId(req: Sails.Req): string;
				[key: string]: unknown;
			};
			// Action lookup method
			getActions(): { [actionName: string]: unknown };
			on(event: string, cb: (...args: unknown[]) => void): void;
			emit(event: string, ...args: unknown[]): void;
			getDatastore(name?: string): Datastore;
		}

		export interface Hook {
			initialize: (cb: () => void) => void;
			routes: {
				before: { [key: string]: unknown };
				after: { [key: string]: unknown };
			};
			configure?: () => void;
			defaults?: { [key: string]: unknown };
		}

		export interface Datastore {
			manager: {
				collection: (name: string) => {
					createIndex: (spec: object) => Promise<unknown>;
					find: (filter: object) => {
						forEach: (cb: (doc: globalThis.Record<string, unknown>) => void | Promise<void>) => Promise<void> | void;
					};
					insertOne: (doc: globalThis.Record<string, unknown>) => Promise<unknown>;
					deleteOne: (filter: object) => Promise<unknown>;
				};
			};
			transaction?<T>(work: (connection: Connection) => Promise<T>): Promise<T>;
		}

		export type Connection = unknown;

		export interface Model<T> {
			attributes: object;

			create(params: object): WaterlinePromise<T>;
			create(params: Array<object>): WaterlinePromise<T[]>;
			create(params: object, cb: (err: Error, created: T) => void): void;
			create(params: Array<object>, cb: (err: Error, created: T[]) => void): void;

			find(): QueryBuilder;
			find(params: object): QueryBuilder;

			findOne(criteria: object): WaterlinePromise<T>;
			findOne(criteria: object, cb: (err: Error, found: T) => void): void;

			findOrCreate(criteria: object, values: object): WaterlinePromise<T>;
			findOrCreate(criteria: object, values: object, cb: (err: Error, found: T) => void): void;

			count(): WaterlinePromise<number>;
			count(criteria: object): WaterlinePromise<number>;
			count(criteria: Array<object>): WaterlinePromise<number>;
			count(criteria: string): WaterlinePromise<number>;
			count(criteria: number): WaterlinePromise<number>;

			count(criteria: object, cb: (err: Error, found: number) => void): void;
			count(criteria: Array<object>, cb: (err: Error, found: number) => void): void;
			count(criteria: string, cb: (err: Error, found: number) => void): void;
			count(criteria: number, cb: (err: Error, found: number) => void): void;

			destroy(criteria: object): WaterlinePromise<T[]>;
			destroy(criteria: Array<object>): WaterlinePromise<T[]>;
			destroy(criteria: string): WaterlinePromise<T[]>;
			destroy(criteria: number): WaterlinePromise<T[]>;

			destroy(criteria: object, cb: (err: Error, deleted: T[]) => void): void;
			destroy(criteria: Array<object>, cb: (err: Error, deleted: T[]) => void): void;
			destroy(criteria: string, cb: (err: Error, deleted: T[]) => void): void;
			destroy(criteria: number, cb: (err: Error, deleted: T[]) => void): void;

			destroyOne(criteria: object): WaterlinePromise<T>;
			destroyOne(criteria: string): WaterlinePromise<T>;
			destroyOne(criteria: number): WaterlinePromise<T>;

			update(criteria: object, changes: object): WaterlinePromise<T[]>;
			update(criteria: Array<object>, changes: object): WaterlinePromise<T[]>;
			update(criteria: string, changes: object): WaterlinePromise<T[]>;
			update(criteria: number, changes: object): WaterlinePromise<T[]>;

			update(criteria: object, changes: Array<object>): WaterlinePromise<T[]>;
			update(criteria: Array<object>, changes: Array<object>): WaterlinePromise<T[]>;
			update(criteria: string, changes: Array<object>): WaterlinePromise<T[]>;
			update(criteria: number, changes: Array<object>): WaterlinePromise<T[]>;

			update(criteria: object, changes: Array<object>, cb: (err: Error, updated: T[]) => void): void;
			update(criteria: Array<object>, changes: Array<object>, cb: (err: Error, updated: T[]) => void): void;
			update(criteria: string, changes: Array<object>, cb: (err: Error, updated: T[]) => void): void;
			update(criteria: number, changes: Array<object>, cb: (err: Error, updated: T[]) => void): void;

			// Overload for update without changes (chainable with .set())
			update(criteria: object): WaterlinePromise<T[]>;

			updateOne(criteria: object, changes: object): WaterlinePromise<T | null>;
			updateOne(criteria: object): WaterlinePromise<T | null>;
			updateOne(criteria: string, changes: object): WaterlinePromise<T | null>;
			updateOne(criteria: string): WaterlinePromise<T | null>;
			updateOne(criteria: number, changes: object): WaterlinePromise<T | null>;
			updateOne(criteria: number): WaterlinePromise<T | null>;

			query(sqlQuery: string, cb: (err: Error, results: Array<Record>) => void): void;
			native(cb: (err: Error, collection: Model<T>) => void): void;

			stream(criteria: object, writeEnd: object): NodeJS.WritableStream;
			stream(criteria: Array<object>, writeEnd: object): NodeJS.WritableStream;
			stream(criteria: string, writeEnd: object): NodeJS.WritableStream;
			stream(criteria: number, writeEnd: object): NodeJS.WritableStream;

			stream(criteria: object, writeEnd: object): Error;
			stream(criteria: Array<object>, writeEnd: object): Error;
			stream(criteria: string, writeEnd: object): Error;
			stream(criteria: number, writeEnd: object): Error;

			addToCollection(id: string | number, association: string): { members: (ids: (string | number)[]) => WaterlinePromise<unknown> };
			replaceCollection(id: string | number, association: string): { members: (ids: (string | number)[]) => WaterlinePromise<unknown> };
			removeFromCollection(id: string | number, association: string): { members: (ids: (string | number)[]) => WaterlinePromise<unknown> };
			getDatastore(): Datastore;
		}

		export interface WaterlineAttributes {
			id: string;
		}

		export interface NextFunction extends express.NextFunction { }

		export interface Req extends express.Request {
			options?: any;
			session: express.Request['session'];
			user?: globalThis.Record<string, unknown>;
			query: { [key: string]: string | undefined };
			param(name: string, defaultValue?: string): string;
			isAuthenticated(): this is Express.AuthenticatedRequest;
			[key: string]: unknown;
		}

		// TODO: We have some places where Req.param expects a non nullable string, and some places where it can be undefined or null. 
		// We should standardize this to avoid confusion and refactor accordingly.
		export interface ReqParamProvider {
			param(name: string, defaultValue?: string): string | undefined | null;
			params?: globalThis.Record<string, unknown>;
			body?: globalThis.Record<string, unknown>;
			session?: express.Request['session'];
		}

		// Sails.js Response interface - uses intersection type to add Sails-specific methods

		export interface Res extends Omit<express.Response, 'badRequest'> {
			attachement(filename: string): void;

			badRequest(data?: unknown, pathToView?: string): this;

			serverError(data?: unknown, pathToView?: string): this;

			notFound(data?: unknown, pathToView?: string): this;

			view(route: string, options?: unknown): void;
			guessView(options: unknown, cb: () => void): void;
		}

		export type Policy = (req: Req, res: Res, next: NextFunction) => Promise<void> | void;

		export class WaterlinePromise<T> extends Promise<T> {
			exec(cb: (err: Error, results: T) => void): void;
			set(values: object): WaterlinePromise<T>;
			meta(options: object): WaterlinePromise<T>;
			fetch(): WaterlinePromise<T>;
			usingConnection(connection: Connection): WaterlinePromise<T>;

			populate(association: string): QueryBuilder;
			populate(association: string, filter: object): QueryBuilder;
		}

		export class Record {
			id: number;
			createdAt: Date;
			updatedAt: Date;
		}

		export class QueryResult extends Record {
			destroy(): Promise<Array<Sails.QueryResult>>;

			toJSON(): object;
		}

		export class QueryBuilder extends Promise<unknown> {
			exec(cb: (error: Error | null, results: Array<QueryResult>) => void): void;
			set(values: object): QueryBuilder;
			meta(options: object): QueryBuilder;
			usingConnection(connection: Connection): QueryBuilder;

			where(condition: object): QueryBuilder;

			limit(lim: number): QueryBuilder;

			skip(num: number): QueryBuilder;

			sort(criteria: string): QueryBuilder;

			populate(association: string): QueryBuilder;
			populate(association: string, filter: object): QueryBuilder;
		}

		export interface Controller { }
	}
}

// Export type alias for use in TypeScript files
// Use: import type { Sails } from '@researchdatabox/redbox-core-types';
// Or:  export type SailsApplication = Sails.Application;

export { }; // Ensure the file is treated as a module
