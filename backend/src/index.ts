import { Elysia } from "elysia";
import { createAuthPlugin } from "./lib/middleware";
import { userRoutes } from "./routes/user";

/**
 * GazeCore Backend - Main Server
 * Route-first architecture
 */
const app = new Elysia()
  .onAfterHandle(({ request, response, set }) => {
    const url = new URL(request.url)
    const status = response instanceof Response
      ? response.status
      : typeof set.status === "number"
        ? set.status
        : 200

    console.log(`[REQ] ${request.method} ${url.pathname} -> ${status}`)
  })
  // Auth middleware (CORS + auth derive)
  .use(createAuthPlugin())
  // Root endpoint
  .get("/", () => ({
    message: "GazeCore Backend API",
    version: "1.0.0",
    status: "running",
  }))
  // Health check
  .get("/health", () => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
  }))
  // API routes grouped under /api
  .group("/api", (app) =>
    app
      // Better Auth endpoints are mounted by middleware at /api/auth/*
      // User routes: /api/users/me, /api/users/:id
      .use(userRoutes)
  )
  .listen(3000);

console.log(`
🦊 Elysia is running at http://localhost:3000
📚 Better Auth: http://localhost:3000/api/auth
📖 Health Check: http://localhost:3000/health
`);
