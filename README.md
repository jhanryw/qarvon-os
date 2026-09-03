# Qarvon OS

Sistema interno de gestão comercial (CRM) e financeira da Qarvon.

Documentação de produto/arquitetura em [CLAUDE.md](./CLAUDE.md), [docs/VISION.md](./docs/VISION.md), [docs/PRODUCT.md](./docs/PRODUCT.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/DATABASE.md](./docs/DATABASE.md), [docs/METRICS.md](./docs/METRICS.md), [docs/ROADMAP.md](./docs/ROADMAP.md).

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencher com credenciais da instância Supabase (local ou self-hosted)
npm run dev
```

## Scripts

```bash
npm run dev         # servidor de desenvolvimento
npm run build        # build de produção
npm run typecheck    # verificação de tipos
npm run lint          # lint
npm run test           # testes (Vitest)
```

## Banco de dados (Supabase self-hosted)

Ver [supabase/README.md](./supabase/README.md) para migrations, geração de tipos
e [supabase/BOOTSTRAP.md](./supabase/BOOTSTRAP.md) para o procedimento de
vínculo de usuários à organização.

## Deploy

### Docker

Build multi-stage (`Dockerfile`), usando `output: "standalone"` do Next.js —
a imagem final contém só o server standalone, os assets estáticos e `public/`.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=<url> \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
  -t qarvon-os .

docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=<url> \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
  -e SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  qarvon-os
```

`NEXT_PUBLIC_*` precisam existir em build-time (entram no bundle client);
`SUPABASE_SERVICE_ROLE_KEY` é usada apenas em runtime, server-side.

Health check do container: `GET /api/health` → `{"status":"ok"}` (não toca
banco, não exige autenticação).

### EasyPanel

- Deploy a partir deste repositório GitHub, usando o `Dockerfile` da raiz
- Porta interna do container: **3000**
- Variáveis de ambiente reais (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) são
  configuradas diretamente no painel do EasyPanel — nunca no GitHub
- Nenhuma credencial deve estar versionada neste repositório
