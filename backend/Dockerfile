FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy manifest first to leverage layer caching
COPY package.json bun.lock ./

# Install production dependencies
RUN bun install --frozen-lockfile --production

# Copy source files needed for the build
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src

# Build the backend
RUN bun run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

EXPOSE 4000

# Run as non-root for safer container hosting
RUN addgroup -S bunapp && adduser -S bunuser -G bunapp

USER bunuser

CMD ["bun", "run", "start"]