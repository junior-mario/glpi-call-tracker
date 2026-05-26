const { DEFAULT_MONITOR_CONFIG } = require("./defaults");
const { parseDate, stripHtml, minutesBetween } = require("./utils");

function normalizeBaseUrl(url) {
  return String(url || "")
    .replace(/\/+$/, "")
    .replace(/\/apirest\.php$/i, "");
}

function mapGLPIStatus(status) {
  switch (Number(status)) {
    case 1:
      return "new";
    case 2:
      return "in-progress";
    case 3:
    case 4:
      return "pending";
    case 5:
      return "resolved";
    case 6:
      return "closed";
    default:
      return "new";
  }
}

function mapGLPIPriority(priority) {
  switch (Number(priority)) {
    case 1:
    case 2:
      return "low";
    case 3:
      return "medium";
    case 4:
      return "high";
    case 5:
    case 6:
      return "urgent";
    default:
      return "medium";
  }
}

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeForComparison(value) {
  return toText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isUnassignedValue(value) {
  const normalized = normalizeForComparison(value);
  if (!normalized) return true;

  if (normalized === "0" || normalized === "null" || normalized === "none") return true;
  if (normalized.includes("nao atribuido")) return true;
  if (normalized.includes("sem tecnico")) return true;
  if (normalized.includes("sem responsavel")) return true;
  if (normalized.includes("unassigned")) return true;

  return false;
}

function isAssignedTicket(ticket) {
  const numericRaw = Number(ticket.technician_raw);
  if (Number.isFinite(numericRaw)) {
    if (numericRaw > 0) return true;
    if (numericRaw <= 0) return false;
  }

  if (!isUnassignedValue(ticket.technician_raw)) return true;
  if (!isUnassignedValue(ticket.technician_name)) return true;
  return false;
}

function parseGLPIError(data) {
  if (Array.isArray(data)) {
    return `${data[0]}${data[1] ? `: ${data[1]}` : ""}`;
  }
  if (data && typeof data === "object") {
    if ("0" in data) {
      return `${data[0]}${data[1] ? `: ${data[1]}` : ""}`;
    }
    if ("message" in data) return String(data.message);
    if ("error" in data) return String(data.error);
  }
  return "";
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const trimmed = text.trim();
  let json = null;

  const shouldTryJson =
    contentType.toLowerCase().includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (shouldTryJson && trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }

  return { contentType, text, json };
}

async function initSession(config) {
  const apiBase = normalizeBaseUrl(config.base_url);
  const response = await fetch(`${apiBase}/apirest.php/initSession`, {
    method: "GET",
    headers: {
      "App-Token": config.app_token,
      Authorization: `user_token ${config.user_token}`,
    },
  });

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      parseGLPIError(payload.json) ||
        `Erro initSession HTTP ${response.status}. Preview: ${payload.text.slice(0, 200)}`
    );
  }

  const token =
    payload.json &&
    typeof payload.json === "object" &&
    typeof payload.json.session_token === "string"
      ? payload.json.session_token
      : "";

  if (!token) {
    throw new Error(
      `initSession sem session_token (content-type ${payload.contentType || "n/a"}). Preview: ${payload.text
        .replace(/\s+/g, " ")
        .slice(0, 200)}`
    );
  }

  return { apiBase, sessionToken: token };
}

async function killSession(config, sessionToken) {
  try {
    const apiBase = normalizeBaseUrl(config.base_url);
    await fetch(`${apiBase}/apirest.php/killSession`, {
      method: "GET",
      headers: {
        "App-Token": config.app_token,
        "Session-Token": sessionToken,
      },
    });
  } catch {
    // ignore
  }
}

async function requestJSON(ctx, endpoint) {
  const response = await fetch(`${ctx.apiBase}/apirest.php${endpoint}`, {
    method: "GET",
    headers: {
      "App-Token": ctx.appToken,
      "Session-Token": ctx.sessionToken,
    },
  });
  const payload = await readResponsePayload(response);
  if (!response.ok && response.status !== 206) {
    throw new Error(parseGLPIError(payload.json) || `Erro GLPI HTTP ${response.status} em ${endpoint}`);
  }
  return payload.json;
}

async function resolveUserName(ctx, userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return "";
  if (ctx.userCache.has(id)) return ctx.userCache.get(id);

  const promise = (async () => {
    try {
      const data = await requestJSON(ctx, `/User/${id}`);
      if (!data || typeof data !== "object") return "";
      if (data.firstname && data.realname) return `${data.firstname} ${data.realname}`.trim();
      return toText(data.name);
    } catch {
      return "";
    }
  })();

  ctx.userCache.set(id, promise);
  return promise;
}

async function getTicketAssigneeId(ctx, ticketId) {
  try {
    const data = await requestJSON(ctx, `/Ticket/${ticketId}/Ticket_User`);
    if (!Array.isArray(data)) return null;
    const assigned = data.find((entry) => Number(entry.type) === 2);
    return assigned ? Number(assigned.users_id) : null;
  } catch {
    return null;
  }
}

function buildSearchParams({ statusCode, groupId, start, end, lookbackDate }) {
  const params = new URLSearchParams({
    "forcedisplay[0]": "1", // name
    "forcedisplay[1]": "2", // id
    "forcedisplay[2]": "12", // status
    "forcedisplay[3]": "15", // opened
    "forcedisplay[4]": "19", // updated
    "forcedisplay[5]": "3", // priority
    "forcedisplay[6]": "5", // technician
    "forcedisplay[7]": "4", // requester
    "forcedisplay[8]": "8", // group
    "forcedisplay[9]": "7", // category
    range: `${start}-${end}`,
  });

  let criterion = 0;
  params.set(`criteria[${criterion}][field]`, "12");
  params.set(`criteria[${criterion}][searchtype]`, "equals");
  params.set(`criteria[${criterion}][value]`, String(statusCode));
  criterion += 1;

  if (groupId !== null && groupId !== undefined) {
    params.set(`criteria[${criterion}][link]`, "AND");
    params.set(`criteria[${criterion}][field]`, "8");
    params.set(`criteria[${criterion}][searchtype]`, "equals");
    params.set(`criteria[${criterion}][value]`, String(groupId));
    criterion += 1;
  }

  if (lookbackDate) {
    params.set(`criteria[${criterion}][link]`, "AND");
    params.set(`criteria[${criterion}][field]`, "15");
    params.set(`criteria[${criterion}][searchtype]`, "morethan");
    params.set(`criteria[${criterion}][value]`, lookbackDate);
  }

  return params;
}

function toLookbackDate(days) {
  const now = new Date();
  now.setDate(now.getDate() - Math.max(1, Number(days || DEFAULT_MONITOR_CONFIG.ticket_lookback_days)));
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

function normalizeCandidateFromRow(row, fallbackGroupName = "") {
  const ticketId = toText(row["2"]);
  if (!ticketId) return null;

  const statusCode = Number(row["12"] || 1);
  const priorityCode = Number(row["3"] || 3);

  return {
    ticket_id: ticketId,
    title: stripHtml(toText(row["1"])),
    status_code: statusCode,
    status: mapGLPIStatus(statusCode),
    priority_code: priorityCode,
    priority: mapGLPIPriority(priorityCode),
    opened_at: toText(row["15"]),
    updated_at: toText(row["19"]),
    technician_raw: row["5"],
    requester_raw: row["4"],
    group_name: toText(row["8"]) || fallbackGroupName,
    category: toText(row["7"]),
  };
}

async function collectActiveTickets(config, monitorConfig) {
  const { apiBase, sessionToken } = await initSession(config);
  const ctx = {
    apiBase,
    sessionToken,
    appToken: config.app_token,
    userCache: new Map(),
  };

  try {
    const statuses = Array.isArray(monitorConfig.monitored_status_codes) && monitorConfig.monitored_status_codes.length
      ? monitorConfig.monitored_status_codes
      : DEFAULT_MONITOR_CONFIG.monitored_status_codes;
    const groups =
      Array.isArray(monitorConfig.monitored_group_ids) && monitorConfig.monitored_group_ids.length
        ? monitorConfig.monitored_group_ids
        : [];
    const includeUnassigned = Boolean(monitorConfig.include_unassigned_tickets);
    const lookbackDate = toLookbackDate(monitorConfig.ticket_lookback_days);
    const maxResults = Number(monitorConfig.max_results_per_status || DEFAULT_MONITOR_CONFIG.max_results_per_status);
    const pageSize = 500;

    if (!groups.length) {
      return [];
    }

    const byTicket = new Map();

    for (const statusCode of statuses) {
      for (const groupId of groups) {
        let start = 0;
        let total = 0;

        while (start < maxResults) {
          const end = start + pageSize - 1;
          const params = buildSearchParams({ statusCode, groupId, start, end, lookbackDate });
          const data = await requestJSON(ctx, `/search/Ticket?${params.toString()}`);
          const rows = data && Array.isArray(data.data) ? data.data : [];
          total = Number(data?.totalcount || 0);

          if (!rows.length) break;

          for (const row of rows) {
            const normalized = normalizeCandidateFromRow(row);
            if (!normalized) continue;

            const current = byTicket.get(normalized.ticket_id);
            if (!current) {
              byTicket.set(normalized.ticket_id, normalized);
            } else {
              const currDate = parseDate(current.updated_at);
              const nextDate = parseDate(normalized.updated_at);
              if (!currDate || (nextDate && nextDate > currDate)) {
                byTicket.set(normalized.ticket_id, { ...current, ...normalized });
              }
            }
          }

          start += pageSize;
          if (start >= total) break;
        }
      }
    }

    const tickets = Array.from(byTicket.values());
    const userIds = new Set();

    for (const ticket of tickets) {
      const techId = Number(ticket.technician_raw);
      const requesterId = Number(ticket.requester_raw);
      if (Number.isFinite(techId) && techId > 0) userIds.add(techId);
      if (Number.isFinite(requesterId) && requesterId > 0) userIds.add(requesterId);
    }

    await Promise.all(Array.from(userIds).map((userId) => resolveUserName(ctx, userId)));

    const mappedTickets = await Promise.all(
      tickets.map(async (ticket) => {
        const techId = Number(ticket.technician_raw);
        const requesterId = Number(ticket.requester_raw);
        const techText = toText(ticket.technician_raw);
        const requesterText = toText(ticket.requester_raw);

        const technician_name =
          Number.isFinite(techId) && techId > 0 ? (await resolveUserName(ctx, techId)) || techText : techText;
        const requester_name =
          Number.isFinite(requesterId) && requesterId > 0
            ? (await resolveUserName(ctx, requesterId)) || requesterText
            : requesterText;

        return {
          ...ticket,
          technician_name,
          requester_name,
        };
      })
    );

    return includeUnassigned ? mappedTickets : mappedTickets.filter((ticket) => isAssignedTicket(ticket));
  } finally {
    await killSession(config, sessionToken);
  }
}

async function getTicketSubItems(ctx, ticketId, subItemType) {
  try {
    const data = await requestJSON(ctx, `/Ticket/${ticketId}/${subItemType}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function detectWaitingThirdParty(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return false;
  const patterns = [
    "aguardando terceiro",
    "aguardando fornecedor",
    "aguardando fabricante",
    "dependencia externa",
    "dependencia de terceiro",
    "terceiro",
    "fornecedor",
    "fabricante",
    "parceiro externo",
    "externo",
  ];
  return patterns.some((fragment) => normalized.includes(fragment));
}

function calculateReopenCount(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return 0;
  const matches = normalized.match(/reabert/g);
  return matches ? matches.length : 0;
}

function summarizeHistory(updates) {
  if (!Array.isArray(updates) || updates.length === 0) return "";
  const last = updates.slice(-6);
  const lines = last.map((event) => {
    const date = toText(event.date);
    const content = stripHtml(event.content || "").slice(0, 180);
    return `[${date}] (${event.type}) ${content}`;
  });
  return lines.join(" | ");
}

function buildConsolidatedTicketFromPayload({
  candidate,
  ticketData,
  updates,
  requesterNameFromTicket,
  assigneeNameFromTicket,
}) {
  const sortedUpdates = [...(updates || [])].sort((a, b) => {
    const left = parseDate(a.date)?.getTime() || 0;
    const right = parseDate(b.date)?.getTime() || 0;
    return left - right;
  });

  const openedAt = toText(ticketData?.date_creation) || candidate.opened_at;
  const updatedAt = toText(ticketData?.date_mod) || candidate.updated_at;
  const lastEvent = sortedUpdates.length ? sortedUpdates[sortedUpdates.length - 1] : null;
  const lastInteractionAt = toText(lastEvent?.date) || updatedAt || openedAt || new Date().toISOString();
  const lastInteractionDate = parseDate(lastInteractionAt) || new Date();
  const minutesSinceLastInteraction = minutesBetween(lastInteractionDate, new Date()) || 0;
  const historySummary = summarizeHistory(sortedUpdates);

  const combinedText = [candidate.title, stripHtml(ticketData?.content || ""), historySummary]
    .filter(Boolean)
    .join(" ");

  const reopenCount = calculateReopenCount(combinedText);

  return {
    ticket_id: String(candidate.ticket_id),
    title: candidate.title || stripHtml(ticketData?.name || ""),
    description: stripHtml(ticketData?.content || ""),
    status: candidate.status || mapGLPIStatus(ticketData?.status),
    priority: candidate.priority || mapGLPIPriority(ticketData?.priority),
    category: candidate.category || toText(ticketData?.itilcategories_id),
    requester_name: candidate.requester_name || requesterNameFromTicket || "",
    group_name: candidate.group_name || "",
    technician_name: candidate.technician_name || assigneeNameFromTicket || "Nao atribuido",
    opened_at: openedAt,
    updated_at: updatedAt,
    last_interaction_type: lastEvent?.type || "ticket",
    last_interaction_at: lastInteractionAt,
    minutes_since_last_interaction: minutesSinceLastInteraction,
    is_reopened: reopenCount > 0,
    reopen_count: reopenCount,
    waiting_third_party: detectWaitingThirdParty(combinedText),
    history_summary: historySummary,
  };
}

async function consolidateTicket(config, candidate) {
  const { apiBase, sessionToken } = await initSession(config);
  const ctx = {
    apiBase,
    sessionToken,
    appToken: config.app_token,
    userCache: new Map(),
  };

  try {
    let ticketData = null;
    try {
      ticketData = await requestJSON(ctx, `/Ticket/${candidate.ticket_id}`);
    } catch {
      ticketData = null;
    }

    const [followups, solutions, tasks, validations, assigneeUserId] = await Promise.all([
      getTicketSubItems(ctx, candidate.ticket_id, "ITILFollowup"),
      getTicketSubItems(ctx, candidate.ticket_id, "ITILSolution"),
      getTicketSubItems(ctx, candidate.ticket_id, "TicketTask"),
      getTicketSubItems(ctx, candidate.ticket_id, "TicketValidation"),
      getTicketAssigneeId(ctx, candidate.ticket_id),
    ]);

    const requesterId = Number(ticketData?.users_id_recipient || 0);
    const requesterNameFromTicket = requesterId > 0 ? await resolveUserName(ctx, requesterId) : "";
    const assigneeNameFromTicket = assigneeUserId ? await resolveUserName(ctx, assigneeUserId) : "";

    const updates = [];

    if (ticketData?.content) {
      updates.push({
        date: ticketData.date_creation,
        type: "description",
        content: stripHtml(ticketData.content),
      });
    }

    for (const item of followups) {
      updates.push({
        date: item.date_creation,
        type: "followup",
        content: stripHtml(item.content),
      });
    }
    for (const item of solutions) {
      updates.push({
        date: item.date_creation,
        type: "solution",
        content: stripHtml(item.content),
      });
    }
    for (const item of tasks) {
      updates.push({
        date: item.date_creation,
        type: "task",
        content: stripHtml(item.content),
      });
    }
    for (const item of validations) {
      updates.push({
        date: item.date_mod || item.date_creation,
        type: "validation",
        content: stripHtml(item.comment_validation || item.comment_submission),
      });
    }

    return buildConsolidatedTicketFromPayload({
      candidate,
      ticketData,
      updates,
      requesterNameFromTicket,
      assigneeNameFromTicket,
    });
  } finally {
    await killSession(config, sessionToken);
  }
}

module.exports = {
  collectActiveTickets,
  consolidateTicket,
  buildConsolidatedTicketFromPayload,
  isAssignedTicket,
  mapGLPIStatus,
  mapGLPIPriority,
};
