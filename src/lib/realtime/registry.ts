import type { WebSocket } from "ws";

// One Node process (the custom server in server.ts) holds every open connection in
// memory, keyed by userId (a user can have several tabs/devices open at once). Cloud
// Run runs this with --min-instances=1, so there's only ever one process — no cross-
// instance fan-out needed. If that ever changes (autoscaling past one instance), this
// registry stops being sufficient: replace it with a Redis pub/sub channel that every
// instance subscribes to and republishes from, so a message posted on instance A still
// reaches a socket held open on instance B.
const connectionsByUser = new Map<string, Set<WebSocket>>();

export function registerConnection(userId: string, socket: WebSocket): void {
  let sockets = connectionsByUser.get(userId);
  if (!sockets) {
    sockets = new Set();
    connectionsByUser.set(userId, sockets);
  }
  sockets.add(socket);
  socket.once("close", () => {
    sockets!.delete(socket);
    if (sockets!.size === 0) connectionsByUser.delete(userId);
  });
}

export function getConnectionsForUser(userId: string): Set<WebSocket> {
  return connectionsByUser.get(userId) ?? new Set();
}

export function connectedUserCount(): number {
  return connectionsByUser.size;
}
