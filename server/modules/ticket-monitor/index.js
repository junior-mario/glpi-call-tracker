const repository = require("./repository");
const { createTicketMonitorService } = require("./service");
const { registerTicketMonitorRoutes } = require("./routes");

module.exports = {
  ticketMonitorRepository: repository,
  createTicketMonitorService,
  registerTicketMonitorRoutes,
};

