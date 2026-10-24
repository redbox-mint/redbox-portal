import type { Application, Request } from 'express';

export class RequestDetails {
  brandId: string | undefined;
  portalId: string;
  userAgent: string | string[] | undefined;
  app: Application;
  baseUrl: string;
  body: unknown;
  cookies: Record<string, string>;
  fresh: boolean;
  hostname: string;
  ip: string | undefined;
  ips: string[];
  method: string;
  originalUrl: string;
  params: Record<string, string | string[]>;
  path: string;
  protocol: string;
  query: Request['query'];
  secure: boolean;
  route: unknown;
  stale: boolean;
  subdomains: string[];
  xhr: boolean;
  headers: Record<string, string | string[] | undefined>;
  url: string;
  rawHeaders: string[];

  constructor(req: Request, context: { brandId?: string; portalId: string }) {
    this.brandId = context.brandId;
    this.portalId = context.portalId;
    this.userAgent = req.headers?.['user-agent'];
    this.app = req.app;
    this.baseUrl = req.baseUrl;
    this.body = req.body;
    this.cookies = req.cookies;
    this.fresh = req.fresh;
    this.hostname = req.hostname;
    this.ip = req.ip;
    this.ips = req.ips;
    this.method = req.method;
    this.originalUrl = req.originalUrl;
    this.params = req.params;
    this.path = req.path;
    this.protocol = req.protocol;
    this.query = req.query;
    this.route = req.route;
    this.secure = req.secure;
    this.stale = req.stale;
    this.subdomains = req.subdomains;
    this.xhr = req.xhr;
    this.headers = req.headers;
    this.url = req.url;
    this.rawHeaders = req.rawHeaders;
  }
}
