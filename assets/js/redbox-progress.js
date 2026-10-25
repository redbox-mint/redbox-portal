/* The portal loads Socket.IO's browser bundle from its configured progress path. */
window.createRedboxProgress = function ({ io, endpoint, tokenUrl, csrfToken, onProgress }) {
  let closed = false;
  let reconnectTimer;
  let generation = 0;
  // Socket.IO does not reconnect after a namespace/auth rejection. Retry grant
  // acquisition too, with one bounded delay and no replay of a one-use token.
  const reconnect = () => {
    if (closed || reconnectTimer) return;
    generation++;
    socket.disconnect();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      if (!closed) socket.connect();
    }, 1000);
  };
  const socket = io(endpoint.origin, {
    path: endpoint.path,
    autoConnect: false,
    transports: ['websocket'],
    auth: async callback => {
      if (closed) return;
      const attempt = ++generation;
      const current = () => !closed && attempt === generation;
      try {
        const response = await fetch(tokenUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRF-Token': csrfToken(), 'X-ReDBox-Api-Version': '2.0' },
        });
        if (!current()) return;
        if (response.status === 401 || response.status === 403) {
          socket.disconnect();
          return;
        }
        if (!response.ok) {
          reconnect();
          return;
        }
        const token = (await response.json()).data?.token;
        if (!current()) return;
        if (typeof token !== 'string' || !token) {
          reconnect();
          return;
        }
        callback({ token });
      } catch {
        if (current()) reconnect();
      }
    },
  });
  // Transport closure can precede namespace connection (and its disconnect
  // event). A late HTTP result belongs only to the transport that requested it.
  socket.io.on('close', () => generation++);
  const rooms = new Set();
  socket.on('connect', () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    for (const room of rooms) socket.emit('subscribe', room);
  });
  socket.on('connect_error', () => {
    if (!socket.active) reconnect();
  });
  for (const event of ['start', 'update', 'stop']) socket.on(event, progress => onProgress(event, progress));
  socket.connect();
  return {
    subscribe(room, accepted) {
      rooms.add(room);
      socket.emit('subscribe', room, accepted);
    },
    unsubscribe(room) {
      rooms.delete(room);
      socket.emit('unsubscribe', room);
    },
    close() {
      closed = true;
      generation++;
      clearTimeout(reconnectTimer);
      rooms.clear();
      socket.disconnect();
    },
  };
};
