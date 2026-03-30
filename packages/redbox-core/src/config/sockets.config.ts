/**
 * Sockets Config Interface and Default Values
 * Auto-generated from config/sockets.js
 */

export interface SocketsConfig {
    adapter: 'memory' | 'socket.io-redis' | string;
    host?: string;
    port?: number;
    db?: number;
    pass?: string;
    grant3rdPartyCookie?: boolean;
    beforeConnect?: (handshake: unknown, cb: (err: Error | null, success: boolean) => void) => void;
    afterDisconnect?: (session: unknown, socket: unknown, cb: () => void) => void;
    transports: string[];
}

export const sockets: SocketsConfig = {
    adapter: 'memory',
    transports: []
};
