FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f

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
