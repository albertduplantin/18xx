import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import staticFiles from "@fastify/static";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { gamesRoutes } from "./routes/games.js";
import { wsRoutes } from "./routes/ws.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const JWT_SECRET = process.env["JWT_SECRET"];
const IS_PROD = process.env["NODE_ENV"] === "production";

if (!JWT_SECRET) {
  if (IS_PROD) {
    console.error("FATAL: JWT_SECRET env var is required in production");
    process.exit(1);
  } else {
    console.warn("WARNING: JWT_SECRET not set — using insecure dev default");
  }
}

const fastify = Fastify({ logger: { level: IS_PROD ? "warn" : "info" } });

await fastify.register(cors, {
  origin: IS_PROD ? false : (process.env["CORS_ORIGIN"] ?? "http://localhost:5173"),
});
await fastify.register(jwt, { secret: JWT_SECRET ?? "dev-secret-change-in-production" });
await fastify.register(websocket);

// Serve the built frontend in production
const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = apps/server/dist/ → ../../web/dist = apps/web/dist
const webDistPath = process.env["WEB_DIST_PATH"] ?? resolve(__dirname, "../../web/dist");

if (IS_PROD && existsSync(webDistPath)) {
  await fastify.register(staticFiles, {
    root: webDistPath,
    prefix: "/",
    // Don't intercept API or WS routes
    decorateReply: false,
  });

  // SPA fallback: return index.html for any non-API GET request
  fastify.setNotFoundHandler(async (req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/games") && !req.url.startsWith("/ws") && !req.url.startsWith("/health")) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ error: "Not found" });
  });
}

await fastify.register(gamesRoutes);
await fastify.register(wsRoutes);

fastify.get("/health", async () => ({ status: "ok", ts: Date.now() }));

try {
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  fastify.log.info(`Server listening on port ${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
