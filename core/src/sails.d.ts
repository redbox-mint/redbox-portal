import express = require("express");

declare global {
	namespace Sails {
		import Request = express.Request;

		export interface Application {}

	export interface Model {
		attributes: Object;

		create(params: Object): WaterlinePromise<QueryResult>;
		create(params: Array<Object>): WaterlinePromise<QueryResult>;
		create(params: Object, cb: (err: Error, created: QueryResult)=>void): void;
		create(params: Array<Object>, cb: (err: Error, created: Array<QueryResult>)=>void): void;

		find(): QueryBuilder;
		find(params: Object): QueryBuilder;
		find(params: Object): WaterlinePromise<Array<QueryResult>>;

		findOne(criteria: Object): WaterlinePromise<QueryResult>;

		count(criteria: Object): WaterlinePromise<number>;
		count(criteria: Array<Object>): WaterlinePromise<number>;
		count(criteria: string): WaterlinePromise<number>;
		count(criteria: number): WaterlinePromise<number>;

		count(criteria: Object, cb: (err: Error, found: number)=>void);
		count(criteria: Array<Object>, cb: (err: Error, found: number)=>void);
		count(criteria: string, cb: (err: Error, found: number)=>void);
		count(criteria: number, cb: (err: Error, found: number)=>void);

		destroy(criteria: Object): WaterlinePromise<Array<Record>>;
		destroy(criteria: Array<Object>): WaterlinePromise<Array<Record>>;
		destroy(criteria: string): WaterlinePromise<Array<Record>>;
		destroy(criteria: number): WaterlinePromise<Array<Record>>;

		destroy(criteria: Object, cb: (err: Error, deleted: Array<Record>)=>void): void;
		destroy(criteria: Array<Object>, cb: (err: Error, deleted: Array<Record>)=>void): void;
		destroy(criteria: string, cb: (err: Error, deleted: Array<Record>)=>void): void;
		destroy(criteria: number, cb: (err: Error, deleted: Array<Record>)=>void): void;

		update(criteria: Object, changes: Object): WaterlinePromise<Array<QueryResult>>;
		update(criteria: Array<Object>, changes: Object): WaterlinePromise<Array<QueryResult>>;
		update(criteria: string, changes: Object): WaterlinePromise<Array<QueryResult>>;
		update(criteria: number, changes: Object): WaterlinePromise<Array<QueryResult>>;

		update(criteria: Object, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;
		update(criteria: Array<Object>, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;
		update(criteria: string, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;
		update(criteria: number, changes: Array<Object>): WaterlinePromise<Array<QueryResult>>;

		update(criteria: Object, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>)=>void): void;
		update(criteria: Array<Object>, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>)=>void): void;
		update(criteria: string, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>)=>void): void;
		update(criteria: number, changes: Array<Object>, cb: (err: Error, updated: Array<QueryResult>)=>void): void;

		query(sqlQuery: string, cb: (err: Error, results: Array<Record>)=>void);
		native(cb: (err: Error, collection: Model)=>void);

		stream(criteria: Object, writeEnd: Object): NodeJS.WritableStream;
		stream(criteria: Array<Object>, writeEnd: Object): NodeJS.WritableStream;
		stream(criteria: string, writeEnd: Object): NodeJS.WritableStream;
		stream(criteria: number, writeEnd: Object): NodeJS.WritableStream;

		stream(criteria: Object, writeEnd: Object): Error;
		stream(criteria: Array<Object>, writeEnd: Object): Error;
		stream(criteria: string, writeEnd: Object): Error;
		stream(criteria: number, writeEnd: Object): Error;

	}

	export interface Req extends express.Request { }

	export interface Res extends express.Response {
		attachement(filename:string);

		badRequest();
		badRequest(data:any);
		badRequest(data:any, pathToView:string);

		serverError();
		serverError(data:any);
		serverError(data:any, pathToView:string);

		view(route: string);
	}

	export class WaterlinePromise<T> extends Promise<T> {
		exec(cb: (err: Error, results: Array<QueryResult>)=>void);
		exec(cb: (err: Error, result: QueryResult)=>void);
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
		exec(cb: (error: any, results: Array<QueryResult>)=>void);

		where(condition: Object): QueryBuilder;

		limit(lim: number): QueryBuilder;

		skip(num: number): QueryBuilder;

		sort(criteria: string): QueryBuilder;

		populate(association: string): QueryBuilder;
		populate(association: string, filter: Object): QueryBuilder;
	}

	export interface Controller {}
	}
}

export {}; // Make this a module that augments global scope
