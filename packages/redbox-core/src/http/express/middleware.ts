import express, { type ErrorRequestHandler, type RequestHandler, type Router } from 'express';
import type session from 'express-session';
import { isObservable, lastValueFrom, single, type Observable } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PersistenceOwner } from '../../persistence/owner';
import { prepareSessionIndexes } from '../../persistence/sessions/indexes';
import { composeHttpSession } from './session';
import { createHttpAuthentication } from './authentication';
import type { HttpIdentity } from './identity';
import { sendApiErrors } from './responses';
import { trackHttpRequestWork } from '../../middleware/requestLifetime';
import {
  RequestChronicleHelper,
  defaultRequestChronicleSettings,
  type RequestChronicleSettings,
} from '../../utilities/RequestChronicle';
import { runWithRequestChronicle } from '../../utilities/RequestChronicleContext';

/** Ordinary endpoints require one emission and completion, including asynchronous error delivery. */
export async function singleHttpResult<T>(result: Observable<T> | Promise<T> | T): Promise<T> {
  return isObservable(result) ? lastValueFrom(result.pipe(single())) : result;
}

/** Retain returned work independently from response finish/abort. Express 5 owns error dispatch. */
export function httpAction(
  action: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    const work = Promise.resolve().then(() => action(req, res, next));
    trackHttpRequestWork(req, work);
    void work.catch(next);
  };
}
export interface HttpMiddlewareInput {
  readonly owner: PersistenceOwner;
  readonly identity: HttpIdentity;
  configureAuthentication?(passport: ReturnType<typeof createHttpAuthentication>['passport']): Promise<void>;
  readonly session: session.SessionOptions & { [key: string]: unknown };
  readonly log: ILogger;
  readonly logSettings?: Partial<RequestChronicleSettings>;
  /** Explicit raw/upload mounts excluded from these parsers; pilot mounts none. */
  readonly parserExclusions?: readonly string[];
}

export async function prepareHttpMiddleware(router: Router, input: HttpMiddlewareInput) {
  router.use((req, res, next) => {
    const chronicle = RequestChronicleHelper.fromReq(input.log, req, {
      settings: input.logSettings ?? defaultRequestChronicleSettings,
    });
    chronicle.start();
    chronicle.updateReq(req);
    const finish = () => {
      if (chronicle.finish(res)) chronicle.log(input.log);
    };
    res.once('finish', finish);
    res.once('close', finish);
    runWithRequestChronicle(chronicle, next);
  });
  const parsers = [express.json({ limit: '1mb' }), express.urlencoded({ extended: true, limit: '1mb' })];
  router.use((req, res, next) => {
    if (input.parserExclusions?.some(path => req.path === path || req.path.startsWith(path + '/'))) {
      next();
      return;
    }
    parsers[0](req, res, error => (error ? next(error) : parsers[1](req, res, next)));
  });
  if (input.session.adapter === 'mongo') {
    const reports = await prepareSessionIndexes(input.owner, input.session, 'inspect');
    if (reports.some(report => report.index !== 'ready'))
      throw new Error('Session indexes are not ready. Run explicit persistence:indexes maintenance.');
  }
  const { collection, ...configuration } = input.session;
  const owned = composeHttpSession(
    {
      ...configuration,
      ...(collection ? { collectionName: collection } : {}),
      // Native TTL DDL is maintenance, not a connect-mongo startup side effect.
      ...(input.session.adapter === 'mongo' ? { autoRemove: 'disabled' } : {}),
    },
    input.owner,
    true
  );
  await owned.ready;
  const authentication = createHttpAuthentication(input.identity);
  await input.configureAuthentication?.(authentication.passport);
  router.use(
    owned.middleware,
    httpAction(async (req, _res, next) => {
      // Even a valid old cookie must not deserialize a v5 session through v6 serializers.
      if (
        (Reflect.get(req.session, 'passport') || Reflect.get(req.session, 'user')) &&
        Reflect.get(req.session, 'authenticationVersion') !== 6
      )
        await new Promise<void>((resolve, reject) =>
          req.session.regenerate(error => (error ? reject(error) : resolve()))
        );
      next();
    }),
    authentication.initialize,
    authentication.session
  );
  return {
    ...authentication,
    async authenticateCredential(credential: { sessionId?: string; authorization?: string }) {
      if (credential.authorization !== undefined) {
        const match = /^Bearer (.+)$/i.exec(credential.authorization);
        return match ? input.identity.bearer(match[1]!) : false;
      }
      if (!credential.sessionId) return false;
      const saved = await owned.read(credential.sessionId);
      if (!saved || Reflect.get(saved, 'authenticationVersion') !== 6) return false;
      const passport = Reflect.get(saved, 'passport');
      const id = passport && typeof passport === 'object' ? Reflect.get(passport, 'user') : undefined;
      return typeof id === 'string' ? input.identity.session(id) : false;
    },
  };
}

export function httpErrorHandler(log: ILogger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    // Never log raw datastore/auth/parser errors or user request bodies.
    RequestChronicleHelper.existing(req)?.addInfo({ httpFailure: 'request-failed' });
    if (res.headersSent || res.writableEnded) {
      res.destroy();
      return;
    }
    const type = error && typeof error === 'object' ? Reflect.get(error, 'type') : undefined;
    const status =
      type === 'entity.too.large' ? 413 : type === 'entity.parse.failed' || error instanceof URIError ? 400 : 500;
    try {
      sendApiErrors(req, res, status, [{ detail: status === 500 ? 'Internal server error' : 'Invalid request' }]);
    } catch {
      log.warn('HTTP response could not be completed.');
      res.destroy();
    }
  };
}
