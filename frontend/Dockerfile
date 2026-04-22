FROM oven/bun:1.3.3 AS builder

WORKDIR /app

ARG VITE_GAZECORE_BACKEND_URL=

ENV VITE_GAZECORE_BACKEND_URL=${VITE_GAZECORE_BACKEND_URL}

COPY . .

RUN bun install --frozen-lockfile

WORKDIR /app/apps/web
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 4001

CMD ["nginx", "-g", "daemon off;"]
