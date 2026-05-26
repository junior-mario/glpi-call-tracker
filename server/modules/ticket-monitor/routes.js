function registerTicketMonitorRoutes(app, authenticate, service) {
  app.get("/api/ticket-monitor/summary", authenticate, (req, res) => {
    try {
      const summary = service.getSummary(req.userId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao buscar resumo" });
    }
  });

  app.get("/api/ticket-monitor/tickets", authenticate, (req, res) => {
    try {
      const tickets = service.getLatestTickets(req.userId, req.query || {});
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao listar tickets monitorados" });
    }
  });

  app.get("/api/ticket-monitor/queues/:queueName", authenticate, (req, res) => {
    try {
      const queueName = String(req.params.queueName || "");
      const tickets = service.getQueueTickets(req.userId, queueName, req.query || {});
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao listar fila" });
    }
  });

  app.get("/api/ticket-monitor/tickets/:ticketId", authenticate, (req, res) => {
    try {
      const detail = service.getTicketDetail(req.userId, req.params.ticketId);
      if (!detail) return res.status(404).json({ error: "Ticket monitorado nao encontrado" });
      res.json(detail);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao buscar detalhe" });
    }
  });

  app.get("/api/ticket-monitor/tickets/:ticketId/history", authenticate, (req, res) => {
    try {
      const limit = Number(req.query.limit || 50);
      const history = service.getTicketHistory(req.userId, req.params.ticketId, limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao buscar historico" });
    }
  });

  app.get("/api/ticket-monitor/config", authenticate, (req, res) => {
    try {
      const config = service.getConfig(req.userId);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao carregar configuracoes" });
    }
  });

  app.put("/api/ticket-monitor/config", authenticate, (req, res) => {
    try {
      const updated = service.updateConfig(req.userId, req.body || {});
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao salvar configuracoes" });
    }
  });

  app.post("/api/ticket-monitor/run", authenticate, async (req, res) => {
    try {
      const result = await service.runMonitorForUser(req.userId, { trigger: "manual" });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao executar monitor" });
    }
  });
}

module.exports = {
  registerTicketMonitorRoutes,
};

