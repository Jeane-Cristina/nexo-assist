# Nexo Assist

Agent de atendimento do service desk de TI da Nexo: o funcionário descreve o problema num chat e o agent decide se responde uma dúvida, consulta ou atualiza um chamado, abre um chamado novo ou chama um analista.

> README em construção — será completado com arquitetura, decisões do agent, trade-offs e deploy.

## Estrutura

```
apps/
  tickets-service/   serviço de chamados simulado (o "sistema legado")
  web/               agent (Mastra), chat do funcionário e console do analista
```

## Conversando com o agent pelo terminal

Com o serviço de chamados rodando (abaixo):

```bash
cp apps/web/.env.example apps/web/.env.local   # coloque a chave do Gemini e o mesmo SERVICE_TOKEN
pnpm --filter web chat
```

Avaliação dos cenários do PRD contra o modelo real: `pnpm --filter web eval`.

## Rodando o serviço de chamados

Requisitos: Node 22+ e pnpm 10+.

```bash
pnpm install
cp apps/tickets-service/.env.example apps/tickets-service/.env   # defina SERVICE_TOKEN
pnpm --filter tickets-service dev
```

O banco SQLite é criado e populado com dados de exemplo no primeiro boot. Para recriar os dados (as datas são relativas a "agora"): `pnpm seed`.

Testes: `pnpm test` · Tipos: `pnpm typecheck`
