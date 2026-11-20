import { STATUS_CODES } from 'node:http';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { HttpRequestContext } from '../http/context';
import { resolveLanguage } from '../http/language';
import { PageArtifacts } from './Artifacts';
import { pageLocals } from './locals';
import { pageCsp, type CspConfig } from './csp';
import { Services as Navigation } from '../navigation/Navigation';
import { BrandingModel } from '../model/storage/BrandingModel';

export interface PageRenderingFacts {
  readonly context: HttpRequestContext;
  readonly routeParameters: Record<string, unknown>;
  readonly queryValues: Record<string, unknown>;
  readonly bodyValues?: Record<string, unknown>;
  readonly session: Record<string, unknown>;
  readonly relativeTarget: string;
  readonly requestTarget: string;
  readonly pathname: string;
  csrfToken(): string;
  acceptsHtml(): boolean;
}
export interface PageResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}
/** Application operations and configuration only; no transport objects. */
export interface PageRenderingInput {
  readonly artifacts: PageArtifacts;
  readonly rootContext: string;
  readonly origin: string;
  readonly environment: string;
  readonly csp: CspConfig;
  readonly log: ILogger;
  settings(brand: {
    id: string;
    name?: string;
  }): Promise<
    import('../navigation/Navigation').NavigationInput['configuration'] &
      Record<string, unknown> & { webAnalytics?: { enabled?: boolean; provider?: string; trackingId?: string } }
  >;
  languages(brand: { id: string; name?: string }): Promise<{ code: string; displayName: string; enabled?: boolean }[]>;
  translate(brand: string, language: string, key: string, context?: Record<string, unknown>): string;
  typeface(brand: string): { regularUrl: string } | null;
  readonly templateConfig: Record<string, unknown> & {
    appmode?: Record<string, unknown>;
    i18n?: { next?: { init?: { lng?: unknown; fallbackLng?: unknown; supportedLngs?: unknown } } };
  };
  readonly loginView?: string;
}

/** Read live request facts after hooks; the native host uses the EJS/locals/error implementation. */
export async function preparePageRendering(
  req: PageRenderingFacts,
  input: PageRenderingInput,
  applyHeaders: (headers: Readonly<Record<string, string>>) => void
) {
  const { brand, portal, actor } = req.context;
  req.session.branding = brand.name;
  req.session.portal = portal;
  const settings = await input.settings(brand);
  const { language, languages } = await resolveLanguage({
    query: req.queryValues.lng,
    session: req.session.langCode,
    config: input.templateConfig.i18n?.next?.init,
    languages: () => input.languages(brand),
    warn: () => input.log.warn('Page language options could not be loaded.'),
  });
  req.session.langCode = language;
  const t = (key: string, values?: Record<string, unknown>) => input.translate(brand.name!, language, key, values);
  const hasRole = (name: string) => actor?.roles.some(role => role.brandId === brand.id && role.name === name) === true;
  const param = (name: string) => req.routeParameters[name] ?? req.bodyValues?.[name] ?? req.queryValues[name];
  const initialLocals = {
    branding: brand.name,
    portal,
    lang: language,
    req: {
      query: req.queryValues,
      url: req.relativeTarget,
      originalUrl: req.requestTarget,
      session: req.session,
      user: actor,
      isAuthenticated: () => !!actor,
    },
    data: {},
    ng2_apps: [],
    availableLanguages: languages,
    _csrf: req.csrfToken(),
    isAdmin: hasRole('Admin'),
    oid: req.routeParameters.oid ?? '',
    rdmp: req.queryValues.rdmp ?? '',
    formName: '',
    recordType: String(req.routeParameters.recordType ?? ''),
  } as Record<string, unknown> & { formName: string; recordType: string };
  const headers: Record<string, string> = {};
  const csp = pageCsp({
    configuration: input.csp,
    pathname: req.pathname,
    appUrl: input.origin,
    environment: input.environment,
    analytics: settings.webAnalytics,
  });
  if (csp) {
    headers[csp.headerName] = csp.headerValue;
    // Retained Express installs CSP before fallible locals/navigation preparation.
    // Publish it now so the normal error boundary keeps the generated policy.
    applyHeaders(headers);
    initialLocals.contentSecurityPolicyNonce = csp.nonce;
  }
  const locals = Object.assign(
    initialLocals,
    pageLocals(
      {
        root: input.rootContext,
        origin: input.origin,
        brand,
        portal,
        settings,
        config: input.templateConfig,
        t,
        param,
        typeface: input.typeface(brand.name!),
        faviconUrl: input.rootContext + '/' + brand.name + '/' + portal + '/images/favicon',
        bundleHash: input.artifacts.bundleHash.bind(input.artifacts),
        hasRole,
      },
      initialLocals
    )
  );
  const navigation = new Navigation.Navigation({
    context: {
      isAuthenticated: !!actor,
      user: actor,
      brand: Object.assign(new BrandingModel(), brand),
      brandPortalPath: locals.page.base,
      currentPath: req.requestTarget.split('?')[0],
    },
    configuration: settings,
    appmode: input.templateConfig.appmode ?? {},
    log: input.log,
    translate: t,
    hasRole: (_user, _brand, name) => hasRole(name),
  });
  [locals.menu, locals.homePanels, locals.adminSidebar] = await Promise.all([
    navigation.resolveMenu(),
    navigation.resolveHomePanels(),
    navigation.resolveAdminSidebar(),
  ]);
  const render = (name: string, extra: Record<string, unknown> = {}): string => {
    const file =
      name === 'layout'
        ? input.artifacts.layout(brand.name!, portal)
        : input.artifacts.view(name.replace(/^\/+/, ''), brand.name!, portal);
    if (!file) throw new Error('Required page artifact missing.');
    return input.artifacts.render(file, { ...locals, ...extra });
  };
  locals.superPartial = (name: string) => render(name);
  locals.partial = (name: string, extra?: Record<string, unknown>) => render(name, extra);
  const error = (status: 403 | 404 | 500, data?: { message: string; detailedMessage: string }): PageResponse => {
    if (!req.acceptsHtml())
      return { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } };
    try {
      locals.title = t('default-title') || 'Site';
      return {
        status,
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
        body: render('layout', { body: render(String(status), { data }) }),
      };
    } catch {
      try {
        input.log.warn('Page error artifact could not be rendered.');
      } catch {
        /* observation only */
      }
      return {
        status,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
        body: `${status} ${STATUS_CODES[status]}`,
      };
    }
  };
  return { locals, headers, t, render, error };
}

export function renderPageShell(
  page: Pick<Awaited<ReturnType<typeof preparePageRendering>>, 'locals' | 'headers' | 't' | 'render'>,
  view: string,
  title: string,
  standalone = false
): PageResponse {
  title = title.trim();
  const site = page.t('default-title').trim() || 'Site';
  page.locals.title = title && title !== site ? title + ' | ' + site : site;
  const body = page.render(view);
  return {
    status: 200,
    headers: { ...page.headers, 'Content-Type': 'text/html; charset=utf-8' },
    body: standalone ? body : page.render('layout', { body }),
  };
}
