# Nexo Assist

Agent de atendimento do service desk de TI da Nexo: o funcionário descreve o problema num chat e o agent decide se responde uma dúvida, consulta ou atualiza um chamado, abre um chamado novo ou chama um analista.

> README em construção — será completado com arquitetura, decisões do agent, trade-offs e deploy.

## Estrutura

```
apps/
  tickets-service/   serviço de chamados simulado (o "sistema legado")
```

## Rodando o serviço de chamados

Requisitos: Node 22+ e pnpm 10+.

```bash
pnpm install
cp apps/tickets-service/.env.example apps/tickets-service/.env   # defina SERVICE_TOKEN
pnpm --filter tickets-service dev
```

O banco SQLite é criado e populado com dados de exemplo no primeiro boot. Para recriar os dados (as datas são relativas a "agora"): `pnpm seed`.

Testes: `pnpm test` · Tipos: `pnpm typecheck`
