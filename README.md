# Nexo Assist

Agent de atendimento do service desk de TI da Nexo: o funcionário descreve o problema num chat e o agent decide se responde uma dúvida, consulta ou atualiza um chamado, abre um chamado novo ou chama um analista.

> README em construção — será completado com arquitetura, decisões do agent, trade-offs e deploy.

## Estrutura

```
apps/
  tickets-service/   serviço de chamados simulado (o "sistema legado"), API REST na porta 4000
  web/               Next.js: telas, rotas de API e o agent (Mastra), porta 3000
```

## Como rodar

Requisitos: Node 20.12+ (recomendado 22) e pnpm 10+.

```bash
pnpm install

# 1. Variáveis de ambiente (use o MESMO SERVICE_TOKEN nos dois arquivos)
cp apps/tickets-service/.env.example apps/tickets-service/.env
cp apps/web/.env.example apps/web/.env.local     # + GOOGLE_GENERATIVE_AI_API_KEY e SESSION_SECRET

# 2. Em um terminal: serviço de chamados (cria e popula o banco no primeiro boot)
pnpm --filter tickets-service dev

# 3. Em outro terminal: o app
pnpm --filter web dev
```

Abra http://localhost:3000 e entre com:

| Perfil | E-mail | Senha |
|---|---|---|
| Funcionária | `ana.souza@nexo.com.br` | `nexo123` |
| Analista | `rafael.lima@nexo.com.br` | `nexo123` |

A senha é única para a demonstração (`DEMO_PASSWORD`). Para recriar os dados de exemplo (as datas são relativas a "agora"): `pnpm seed`.

## Outras formas de usar o agent

- **Pelo terminal**, sem as telas: `pnpm --filter web chat`
- **Avaliação** dos cenários do PRD contra o modelo real: `pnpm --filter web eval`

Testes: `pnpm test` · Tipos: `pnpm typecheck`
