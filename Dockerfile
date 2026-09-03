# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- deps: instala dependências a partir do lockfile ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: build de produção (output: "standalone") ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variáveis NEXT_PUBLIC_* precisam existir em build-time para entrar no
# bundle client. As reais são injetadas pelo EasyPanel como build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: imagem final, só o necessário para rodar ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget já vem no BusyBox da imagem alpine — evita instalar curl só para isso.
# Se preferir, o healthcheck pode ser configurado diretamente no EasyPanel
# apontando para GET /api/health em vez de usar esta instrução.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:3000/api/health || exit 1

# server.js é gerado pelo output "standalone" do Next.js
CMD ["node", "server.js"]
