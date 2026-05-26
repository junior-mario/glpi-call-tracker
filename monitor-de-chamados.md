# Modulo Monitor de Chamados (V1)

## Objetivo
Acoplar monitoramento operacional automatico de tickets ativos do GLPI sem substituir o fluxo manual existente.

## O que foi implementado
- novo menu: `Monitor de Chamados`
- novo frontend em rota: `/ticket-monitor`
- scheduler em background no backend (intervalo padrao de 5 minutos)
- motor de regras operacionais centralizado
- consolidacao de dados por ticket antes da analise
- persistencia de historico e estado atual
- endpoints dedicados do modulo
- execucao manual do monitor para teste/admin
- testes automatizados do modulo

## Reaproveitamento da estrutura existente
- autenticacao JWT ja existente (`/api/auth/*`)
- configuracao GLPI ja existente (`glpi_configs`)
- banco SQLite e padrao de migracoes idempotentes
- cliente HTTP frontend (`src/lib/api.ts`)
- layout/menu/rotas protegidas existentes

## Tabelas criadas
1. `ticket_monitor_configs`
- configuracoes do monitor por usuario

2. `ticket_monitor_analysis`
- historico de analises por ticket

3. `ticket_monitor_state`
- estado atual por ticket para leitura rapida e base futura de supressao de alerta

## Scheduler
- iniciado no boot do backend
- ciclo de verificacao a cada 60s
- respeita `monitor_interval_minutes` por usuario
- evita execucao concorrente por usuario
- tolera falha por ticket (continua o lote)

## Endpoints do modulo
- `GET /api/ticket-monitor/summary`
- `GET /api/ticket-monitor/tickets`
- `GET /api/ticket-monitor/queues/:queueName`
- `GET /api/ticket-monitor/tickets/:ticketId`
- `GET /api/ticket-monitor/tickets/:ticketId/history`
- `GET /api/ticket-monitor/config`
- `PUT /api/ticket-monitor/config`
- `POST /api/ticket-monitor/run`

## Regras implementadas
- `SEM_RESPONSAVEL`
- `CHAMADO_PARADO`
- `PENDENTE_SEM_ATUALIZACAO`
- `AGUARDANDO_TERCEIRO_SEM_FOLLOWUP`
- `CHAMADO_REABERTO`
- `CRITICO_SEM_ACAO`
- `CHAMADO_ANTIGO`
- `HISTORICO_INCONSISTENTE`

Cada regra retorna:
- `code`
- `triggered`
- `severity`
- `reason`
- `suggested_queue`
- `recommended_action`

## Filas operacionais
- `SAUDAVEL`
- `ACAO_IMEDIATA`
- `COBRANCA`
- `REVISAO`

## Risco operacional
- `NORMAL`
- `ATENCAO`
- `ALTO`
- `CRITICO`

## Uso no frontend
1. Acesse `Monitor de Chamados` no menu lateral.
2. Clique em `Executar agora` para processar imediatamente.
3. Use os filtros de status, prioridade, risco, fila, grupo, responsavel e texto.
4. Use as abas:
- Visao Geral
- Acao Imediata
- Cobranca
- Revisao
- Configuracoes
5. Abra `Detalhe` para ver regras acionadas e historico de analises.

## Configuracao minima recomendada
- `scheduler_enabled = true`
- `monitor_interval_minutes = 5`
- `monitored_status_codes = [1,2,3,4]`
- thresholds padrao por prioridade/pendencia

## Testes
Executar:

```bash
npm run test:monitor
```

Inclui cobertura de:
- regras principais
- consolidacao de ticket (fallback e heuristica)
- persistencia e resumo via servico do monitor

## Limitacoes V1
- `reopen_count` e `waiting_third_party` usam heuristica textual quando GLPI nao entrega indicador direto
- nao ha envio de alerta externo (Teams/WhatsApp/email) na V1
- nao altera automaticamente tickets no GLPI
- nao faz redistribuicao automatica de chamados
- `filter_requester` da dashboard custom existente continua sem aplicacao no modulo antigo (fora do escopo deste monitor)

## Pontos prontos para evolucao
- gateway de alerta externo aproveitando `needs_alert`/`alert_type`
- enrich com IA sobre `operational_summary`
- supressao de alerta duplicado usando `ticket_monitor_state`
- priorizacao de filas por janela de operacao (SLA/turno)

