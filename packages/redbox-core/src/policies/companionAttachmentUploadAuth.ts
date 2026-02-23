import * as crypto from 'node:crypto';
import { isIP } from 'node:net';

const COMPANION_SECRET_HEADER_DEFAULT = 'x-companion-secret';
const COMPANION_BYPASS_FLAG = 'companionAttachmentUploadAuthorized';

function isLoopbackAddress(rawAddress: unknown): boolean {
    if (typeof rawAddress !== 'string' || rawAddress.trim().length === 0) {
        return false;
    }

    const withoutZone = rawAddress.trim().split('%')[0];
    const normalized = withoutZone.toLowerCase();
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
        return true;
    }

    const v4Mapped = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
    return v4Mapped === '127.0.0.1' || v4Mapped.startsWith('127.');
}

function normalizeAddress(rawAddress: unknown): string | undefined {
    if (typeof rawAddress !== 'string') {
        return undefined;
    }
    let value = rawAddress.trim();
    if (!value || value === 'unknown' || value === '_hidden') {
        return undefined;
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).trim();
    }
    if (value.startsWith('[') && value.includes(']')) {
        value = value.slice(1, value.indexOf(']'));
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
        // IPv4 with port, e.g. 127.0.0.1:12345
        value = value.slice(0, value.lastIndexOf(':'));
    }
    const normalized = value.toLowerCase().split('%')[0].trim();
    return normalized || undefined;
}

function isPrivateOrLoopbackAddress(rawAddress: unknown): boolean {
    const normalized = normalizeAddress(rawAddress);
    if (!normalized) {
        return false;
    }
    if (isLoopbackAddress(normalized)) {
        return true;
    }

    const v4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
    if (isIP(v4) === 4) {
        if (v4.startsWith('10.') || v4.startsWith('192.168.') || v4.startsWith('169.254.')) {
            return true;
        }
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v4)) {
            return true;
        }
        return false;
    }

    if (isIP(normalized) === 6) {
        return normalized.startsWith('fc')
            || normalized.startsWith('fd')
            || normalized.startsWith('fe8')
            || normalized.startsWith('fe9')
            || normalized.startsWith('fea')
            || normalized.startsWith('feb');
    }

    return false;
}

function isIpLikeAddress(rawAddress: unknown): boolean {
    const normalized = normalizeAddress(rawAddress);
    if (!normalized) {
        return false;
    }
    if (isLoopbackAddress(normalized)) {
        return true;
    }
    const v4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
    return isIP(v4) === 4 || isIP(normalized) === 6;
}

function readHeaderValues(raw: unknown): string[] {
    if (typeof raw === 'string') {
        return raw.split(',').map((v) => v.trim()).filter(Boolean);
    }
    if (Array.isArray(raw)) {
        return raw.flatMap((v) => readHeaderValues(v));
    }
    return [];
}

function getForwardedForCandidates(req: Sails.Req): string[] {
    const xForwardedFor = readHeaderValues(req.headers?.['x-forwarded-for']);
    const xRealIp = readHeaderValues(req.headers?.['x-real-ip']);
    const forwarded = readHeaderValues(req.headers?.forwarded)
        .flatMap((entry) => entry.split(';').map((segment) => segment.trim()))
        .map((segment) => {
            const lower = segment.toLowerCase();
            if (!lower.startsWith('for=')) {
                return undefined;
            }
            return segment.slice(4).trim();
        })
        .filter((v): v is string => typeof v === 'string' && v.length > 0);

    return [...xForwardedFor, ...xRealIp, ...forwarded];
}

function isLocalRequest(req: Sails.Req): boolean {
    const socket = (req as Sails.Req & { socket?: { remoteAddress?: string } }).socket;
    const connection = (req as Sails.Req & { connection?: { remoteAddress?: string } }).connection;
    const candidateAddresses = [
        socket?.remoteAddress,
        connection?.remoteAddress,
        ...getForwardedForCandidates(req),
    ];
    const normalizedCandidates = candidateAddresses
        .map((v) => normalizeAddress(v))
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    const ipCandidates = normalizedCandidates.filter((v) => isIpLikeAddress(v));
    if (ipCandidates.length === 0) {
        return false;
    }

    return ipCandidates.every(isPrivateOrLoopbackAddress);
}

function secureEquals(value: string, expected: string): boolean {
    const valueDigest = crypto.createHash('sha256').update(value).digest();
    const expectedDigest = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(valueDigest, expectedDigest);
}

function isAuthenticatedRequest(req: Sails.Req): boolean {
    return typeof req.isAuthenticated === 'function' && req.isAuthenticated();
}

/**
 * CompanionAttachmentUploadAuth Policy
 *
 * Allows Companion-server upload creation requests (POST /companion/record/:oid/attach)
 * to bypass normal checkAuth when they include a valid shared secret header.
 */
export function companionAttachmentUploadAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    const requestWithBypassFlag = req as Sails.Req & Record<string, unknown>;
    if (typeof requestWithBypassFlag[COMPANION_BYPASS_FLAG] !== 'undefined') {
        sails.log.warn(`Ignoring pre-set ${COMPANION_BYPASS_FLAG} value on incoming request.`);
        delete requestWithBypassFlag[COMPANION_BYPASS_FLAG];
    }

    const hasClientSuppliedBypassFlag = [
        req.headers?.[COMPANION_BYPASS_FLAG.toLowerCase()],
        (req.query as Record<string, unknown> | undefined)?.[COMPANION_BYPASS_FLAG],
        (req.body as Record<string, unknown> | undefined)?.[COMPANION_BYPASS_FLAG],
    ].some((value) => typeof value !== 'undefined');
    if (hasClientSuppliedBypassFlag) {
        sails.log.warn(`Ignoring client supplied ${COMPANION_BYPASS_FLAG} in header/query/body.`);
    }

    const method = String(req.method ?? '').toUpperCase();
    const attachId = String(req.param('attachId') ?? '').trim();
    const isCreateRequest = method === 'POST' && attachId.length === 0;
    const isTusChunkRequest = (method === 'PATCH' || method === 'HEAD') && attachId.length > 0;
    if (!isCreateRequest && !isTusChunkRequest) {
        return next();
    }

    const companionConfig = (sails.config.companion as {
        secret?: unknown;
        attachmentSecret?: unknown;
        attachmentSecretHeader?: unknown;
        attachmentLocalOnly?: unknown;
    }) || {};
    const headerName = String(companionConfig.attachmentSecretHeader ?? COMPANION_SECRET_HEADER_DEFAULT)
        .trim()
        .toLowerCase() || COMPANION_SECRET_HEADER_DEFAULT;
    const suppliedSecretRaw = req.headers?.[headerName];
    const suppliedSecret = (Array.isArray(suppliedSecretRaw) ? suppliedSecretRaw[0] : suppliedSecretRaw);
    if (typeof suppliedSecret !== 'string' || suppliedSecret.trim().length === 0) {
        if (!isAuthenticatedRequest(req)) {
            res.status(403).json({ message: 'Companion upload secret is required' });
            return;
        }
        return next();
    }

    const expectedSecret = String(companionConfig.attachmentSecret ?? companionConfig.secret ?? '').trim();
    if (!expectedSecret) {
        sails.log.warn('Companion attachment upload secret is not configured; rejecting companion upload request.');
        res.status(503).json({ message: 'Companion upload auth is not configured' });
        return;
    }

    if (!secureEquals(suppliedSecret.trim(), expectedSecret)) {
        res.status(403).json({ message: 'Invalid companion upload secret' });
        return;
    }

    const localOnly = companionConfig.attachmentLocalOnly !== false;
    if (localOnly && !isLocalRequest(req)) {
        res.status(403).json({ message: 'Companion upload requests must originate locally' });
        return;
    }

    requestWithBypassFlag[COMPANION_BYPASS_FLAG] = true;
    return next();
}

export default companionAttachmentUploadAuth;
