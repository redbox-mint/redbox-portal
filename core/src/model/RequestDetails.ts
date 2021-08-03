export class RequestDetails {
    app: any;
    baseUrl: any;
    body: any;
    cookies: any;
    fresh: any;
    hostname: any;
    ip: any;
    ips: any;
    method: any;
    originalUrl: any;
    params: any;
    path: any;
    protocol: any;
    query: any;
    secure: any;
    route: any;
    stale: any;
    subdomains: any;
    xhr: any;
    headers: any;
    url: any;
    rawHeaders: any;


    constructor(req) {
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
        this.protocol =req.protocol;
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