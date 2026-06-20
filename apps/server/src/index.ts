import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { gamesRoutes } from "./routes/games.js";
import { wsRoutes } from "./routes/ws.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const JWT_SECRET = process.env["JWT_SECRET"] ?? "dev-secret-change-in-production";

const fastify = Fastify({ logger: { level: "info" } });

await fastify.register(cors, { origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173" });
await fastify.register(jwt, { secret: JWT_SECRET });
await fastify.register(websocket);

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
