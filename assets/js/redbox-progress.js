/* The portal loads Socket.IO's browser bundle from its configured progress path. */
window.createRedboxProgress = function ({ io, endpoint, tokenUrl, csrfToken, onProgress }) {
  const socket = io(endpoint.origin, {
    path: endpoint.path,
    autoConnect: false,
    auth: async callback => {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken(), 'X-ReDBox-Api-Version': '2.0' },
      });
      if (!response.ok) {
        socket.disconnect();
        return;
      }
      callback({ token: (await response.json()).data.token });
    },
  });
  const rooms = new Set();
  socket.on('connect', () => {
    for (const room of rooms) socket.emit('subscribe', room);
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
      rooms.clear();
      socket.disconnect();
    },
  };
};
