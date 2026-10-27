// Adapted from https://git.f3l.de/ttomasini/sails-types/raw/branch/master/sails.d.ts
import express = require('express');
import type { SailsConfig } from './config';
import type { ApiRouteDefinition } from './api-routes/types';
import type { ValidatedApiRouteRequest } from './api-routes/validation';
import { RequestChronicleHelper } from './utilities/RequestChronicle';

// passport import type is to be able to access 'Express.AuthenticatedRequest' from '@types/passport'.
// oxlint-disable-next-line eslint/no-unused-vars
import type * as passportType from 'passport';
import { ILogger } from '@researchdatabox/sails-ng-common';

// Augment express-session to include Sails-specific session properties
declare module 'express-session' {
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
      hooks: {
        http?: {
          server?: unknown;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }

    // Log interface based on https://github.com/balderdashy/captains-log
    export type Log = ILogger;

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
      hooks: {
        http?: {
          server?: {
            [key: string]: unknown;
          };
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
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

    export interface NextFunction extends express.NextFunction {}

    export interface ReqOptions {
      locals?: {
        branding?: string;
        portal?: string;
        [key: string]: unknown;
      };
      requestChronicleHelper?: RequestChronicleHelper;
      [key: string]: unknown;
    }

    export interface Req extends express.Request {
      options?: ReqOptions;
      session: express.Request['session'];
      user?: globalThis.Record<string, unknown>;
      apiRoute?: ApiRouteDefinition;
      apiRequest?: ValidatedApiRouteRequest;
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

    export interface Controller {}
  }
}

// Export type alias for use in TypeScript files
// Use: import type { Sails } from '@researchdatabox/redbox-core';
// Or:  export type SailsApplication = Sails.Application;

export {}; // Ensure the file is treated as a module
