// Custom server: plain `next start`/`next dev` can't hold a persistent WebSocket
// connection open (and Vercel's serverless functions can't at all), so this wraps
// Next's request handler in a plain Node http.Server and attaches a `ws` server on
// top of it for chat's live delivery. This is the Cloud Run entrypoint — see
// docs/06-gcp-migration.md. Not bundled by Next, so this file runs directly via
// `tsx` (see package.json's dev/start scripts) and uses relative imports only.
import { createServer, type IncomingMessage } from "http";
import type { Socket } from "net";
import next from "next";
import { WebSocketServer } from "ws";
import { getToken } from "next-auth/jwt";
import { registerConnection } from "./src/lib/realtime/registry";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

async function resolveUserId(req: IncomingMessage): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({
    req: { headers: req.headers as Record<string, string> },
    secret,
    secureCookie: !dev,
  });
  return typeof token?.id === "string" ? token.id : null;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  // Next owns its own upgrade traffic too (dev's Fast Refresh websocket) — only
  // intercept the one path that's ours, forward everything else to Next.
  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket: Socket, head) => {
    if (req.url !== "/ws") {
      nextUpgradeHandler(req, socket, head);
      return;
    }
    resolveUserId(req)
      .then((userId) => {
        if (!userId) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          registerConnection(userId, ws);
        });
      })
      .catch((err) => {
        console.error("WebSocket auth failed", err);
        socket.destroy();
      });
  });

  server.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? "development" : process.env.NODE_ENV}`);
  });
});
