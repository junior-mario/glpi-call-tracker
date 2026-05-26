import { format } from "date-fns";

type PriorityKey = "low" | "medium" | "high" | "urgent";

export interface MonitorReportTicketSource {
  id: number | string;
  name: string;
  technician?: string;
  requester?: string;
  group?: string;
  status: number;
  priority: number;
  date: string;
  date_mod: string;
  tags?: string;
}

interface ReportRow {
  id: string;
  title: string;
  technicianRaw: string;
  technicianName: string;
  requester: string;
  groupRaw: string;
  groupName: string;
  statusCode: number;
  statusLabel: string;
  priorityCode: number;
  priorityLabel: string;
  openedAt: Date | null;
  updatedAt: Date | null;
  tags: string[];
  slaHours: number;
  dueAt: Date | null;
  isOverdue: boolean;
  delayDays: number;
  ticketUrl: string;
}

interface ResponsibilityGroup {
  key: string;
  title: string;
  subtitle: string;
  rows: ReportRow[];
  overdue: number;
  pending: number;
  inProgress: number;
}

interface MutableResponsibilityGroup {
  key: string;
  title: string;
  byTechnician: boolean;
  technicianLabel: string;
  groupLabels: Set<string>;
  rows: ReportRow[];
  overdue: number;
  pending: number;
  inProgress: number;
}

export interface BuildMonitorReportInput {
  tickets: MonitorReportTicketSource[];
  groupName?: string;
  periodLabel?: string;
  generatedAt?: Date;
  glpiBaseUrl?: string;
}

const STATUS_LABELS: Record<number, string> = {
  1: "Novo",
  2: "Em andamento",
  3: "Pendente",
  4: "Pendente",
  5: "Resolvido",
  6: "Fechado",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Muito baixa",
  2: "Baixa",
  3: "Media",
  4: "Alta",
  5: "Muito alta",
  6: "Critica",
};

const SOLUTION_SLA_HOURS: Record<PriorityKey, number> = {
  low: 72,
  medium: 48,
  high: 24,
  urgent: 5,
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBaseUrl(url: string | undefined): string {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/apirest\.php$/i, "");
}

function parseDate(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const normalized = raw.replace(" ", "T");
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, dd, mm, yyyy, hh = "00", min = "00", ss = "00"] = match;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: Date | null): string {
  if (!value) return "-";
  return format(value, "dd/MM/yyyy HH:mm");
}

function splitTags(raw: string): string[] {
  return String(raw || "")
    .split(/,\s*|;\s*|\$\$/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeForCompare(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeEntityKey(value: string): string {
  return normalizeForCompare(value)
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyOnlyId(value: string): boolean {
  const cleaned = String(value || "").trim();
  if (!cleaned) return false;
  return /^[\d.,\s-]+$/.test(cleaned);
}

function toFriendlyName(value: string): string {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";

  const normalized = normalizeForCompare(cleaned);
  if (!normalized) return "";

  if (normalized.includes("nao atribuido")) return "";
  if (normalized.includes("sem tecnico")) return "";
  if (normalized.includes("sem responsavel")) return "";
  if (normalized === "0") return "";
  if (isLikelyOnlyId(cleaned)) return "";

  return cleaned;
}

function fallbackIdLabel(value: string, prefix: string): string {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (!isLikelyOnlyId(cleaned)) return cleaned;
  return `${prefix} ${cleaned}`;
}

function toPriorityKey(priorityCode: number): PriorityKey {
  if (priorityCode >= 5) return "urgent";
  if (priorityCode === 4) return "high";
  if (priorityCode === 3) return "medium";
  return "low";
}

function getSlaHours(priorityCode: number, tags: string[]): number {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  if (normalizedTags.includes("associado")) return 3;
  return SOLUTION_SLA_HOURS[toPriorityKey(priorityCode)];
}

function buildRows(tickets: MonitorReportTicketSource[], now: Date, glpiBaseUrl?: string): ReportRow[] {
  const baseUrl = normalizeBaseUrl(glpiBaseUrl);

  return tickets.map((ticket) => {
    const openedAt = parseDate(ticket.date);
    const updatedAt = parseDate(ticket.date_mod);
    const tags = splitTags(ticket.tags || "");
    const slaHours = getSlaHours(Number(ticket.priority || 0), tags);
    const dueAt = openedAt ? new Date(openedAt.getTime() + slaHours * 60 * 60 * 1000) : null;
    const isClosed = ticket.status === 5 || ticket.status === 6;
    const reference = isClosed && updatedAt ? updatedAt : now;
    const isOverdue = Boolean(dueAt && reference.getTime() > dueAt.getTime());
    const delayDays =
      isOverdue && dueAt ? Math.max(1, Math.floor((reference.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000))) : 0;

    const technicianRaw = String(ticket.technician || "").trim();
    const groupRaw = String(ticket.group || "").trim();

    return {
      id: String(ticket.id || ""),
      title: String(ticket.name || "").trim() || "(Sem titulo)",
      technicianRaw,
      technicianName: toFriendlyName(technicianRaw),
      requester: String(ticket.requester || "").trim(),
      groupRaw,
      groupName: toFriendlyName(groupRaw),
      statusCode: Number(ticket.status || 0),
      statusLabel: STATUS_LABELS[Number(ticket.status || 0)] || String(ticket.status || "-"),
      priorityCode: Number(ticket.priority || 0),
      priorityLabel: PRIORITY_LABELS[Number(ticket.priority || 0)] || String(ticket.priority || "-"),
      openedAt,
      updatedAt,
      tags,
      slaHours,
      dueAt,
      isOverdue,
      delayDays,
      ticketUrl: baseUrl ? `${baseUrl}/front/ticket.form.php?id=${ticket.id}` : "",
    };
  });
}

function buildResponsibilityLabel(row: ReportRow): {
  key: string;
  title: string;
  byTechnician: boolean;
  technicianLabel: string;
} {
  const technicianTitle =
    row.technicianName || fallbackIdLabel(row.technicianRaw, "Tecnico ID") || "Sem tecnico responsavel";
  const groupTitle = row.groupName || fallbackIdLabel(row.groupRaw, "Grupo ID") || "Sem grupo";

  if (technicianTitle && normalizeForCompare(technicianTitle) !== "sem tecnico responsavel") {
    const normalizedTech = normalizeEntityKey(technicianTitle) || technicianTitle.toLowerCase();
    return {
      key: `tech:${normalizedTech}`,
      title: technicianTitle,
      byTechnician: true,
      technicianLabel: technicianTitle,
    };
  }

  const normalizedGroup = normalizeEntityKey(groupTitle) || groupTitle.toLowerCase();
  return {
    key: `group:${normalizedGroup}`,
    title: `Grupo: ${groupTitle}`,
    byTechnician: false,
    technicianLabel: technicianTitle,
  };
}

function groupByResponsibility(rows: ReportRow[]): ResponsibilityGroup[] {
  const map = new Map<string, MutableResponsibilityGroup>();

  rows.forEach((row) => {
    const label = buildResponsibilityLabel(row);
    const groupDisplay = row.groupName || fallbackIdLabel(row.groupRaw, "Grupo ID") || "Sem grupo";
    const current = map.get(label.key);
    if (!current) {
      map.set(label.key, {
        key: label.key,
        title: label.title,
        byTechnician: label.byTechnician,
        technicianLabel: label.technicianLabel,
        groupLabels: new Set([groupDisplay]),
        rows: [row],
        overdue: row.isOverdue ? 1 : 0,
        pending: row.statusCode === 3 || row.statusCode === 4 ? 1 : 0,
        inProgress: row.statusCode === 2 ? 1 : 0,
      });
      return;
    }

    current.groupLabels.add(groupDisplay);
    current.rows.push(row);
    if (row.isOverdue) current.overdue += 1;
    if (row.statusCode === 3 || row.statusCode === 4) current.pending += 1;
    if (row.statusCode === 2) current.inProgress += 1;
  });

  const groups = Array.from(map.values()).map((group): ResponsibilityGroup => {
    const sortedRows = [...group.rows].sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (a.delayDays !== b.delayDays) return b.delayDays - a.delayDays;
      const left = a.updatedAt?.getTime() || 0;
      const right = b.updatedAt?.getTime() || 0;
      return right - left;
    });

    const groupedNames = Array.from(group.groupLabels).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const subtitle = group.byTechnician
      ? `Grupos: ${groupedNames.length ? groupedNames.join(", ") : "Sem grupo"}`
      : `Tecnico: ${group.technicianLabel}`;

    return {
      key: group.key,
      title: group.title,
      subtitle,
      rows: sortedRows,
      overdue: group.overdue,
      pending: group.pending,
      inProgress: group.inProgress,
    };
  });

  return groups.sort((a, b) => {
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    return b.rows.length - a.rows.length;
  });
}

function renderKpis(rows: ReportRow[]): string {
  const total = rows.length;
  const pending = rows.filter((row) => row.statusCode === 3 || row.statusCode === 4).length;
  const inProgress = rows.filter((row) => row.statusCode === 2).length;
  const overdue = rows.filter((row) => row.isOverdue).length;
  const highPriority = rows.filter((row) => row.priorityCode >= 4).length;
  const responsible = groupByResponsibility(rows).length;

  const cards = [
    { label: "Total de chamados", value: total, note: "na consulta", color: "#006924" },
    { label: "Pendentes", value: pending, note: "status 3/4", color: "#dc2626" },
    { label: "Em andamento", value: inProgress, note: "status 2", color: "#166534" },
    { label: "SLA atrasado", value: overdue, note: "prazo calculado", color: "#ef4444" },
    { label: "Prioridade alta+", value: highPriority, note: "4, 5 e 6", color: "#ea580c" },
    { label: "Responsaveis", value: responsible, note: "grupo/tecnico", color: "#009a35" },
  ];

  return cards
    .map(
      (card) => `
        <div class="kpi-card" style="--kpi-color:${card.color}">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <div class="kpi-value">${card.value}</div>
          <div class="kpi-note">${escapeHtml(card.note)}</div>
        </div>
      `
    )
    .join("");
}

function renderRow(row: ReportRow): string {
  const tags = row.tags.length
    ? row.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")
    : `<span class="tag muted">-</span>`;

  const ticketLabel = row.ticketUrl
    ? `<a class="ticket-link" href="${escapeHtml(row.ticketUrl)}" target="_blank" rel="noopener noreferrer">#${escapeHtml(
        row.id
      )}</a>`
    : `#${escapeHtml(row.id)}`;

  const delay = row.isOverdue ? `<span class="delay late">+${row.delayDays}d</span>` : `<span class="delay">-</span>`;

  const statusClass =
    row.statusCode === 5 || row.statusCode === 6
      ? "ok"
      : row.statusCode === 3 || row.statusCode === 4
      ? "warn"
      : "work";

  const priorityClass =
    row.priorityCode >= 5 ? "p-urgent" : row.priorityCode >= 4 ? "p-high" : row.priorityCode === 3 ? "p-medium" : "p-low";

  const technicianCell =
    row.technicianName || fallbackIdLabel(row.technicianRaw, "ID") || "Sem tecnico responsavel";
  const groupCell = row.groupName || fallbackIdLabel(row.groupRaw, "ID") || "Sem grupo";

  return `
    <tr class="${row.isOverdue ? "row-late" : ""}">
      <td class="mono">${ticketLabel}</td>
      <td class="title-cell">${escapeHtml(row.title)}</td>
      <td>${escapeHtml(technicianCell)}</td>
      <td>${escapeHtml(groupCell)}</td>
      <td><span class="pill ${statusClass}">${escapeHtml(row.statusLabel)}</span></td>
      <td><span class="pill ${priorityClass}">${escapeHtml(row.priorityLabel)}</span></td>
      <td>${escapeHtml(row.requester || "-")}</td>
      <td>${formatDateTime(row.openedAt)}</td>
      <td>${formatDateTime(row.updatedAt)}</td>
      <td>${row.dueAt ? formatDateTime(row.dueAt) : "-"}</td>
      <td>${delay}</td>
      <td class="tags-cell">${tags}</td>
    </tr>
  `;
}

function renderGroup(group: ResponsibilityGroup): string {
  const rows = group.rows.map(renderRow).join("");
  const alerts = group.overdue > 0 ? `<span class="pill alert">${group.overdue} atrasado(s)</span>` : `<span class="pill ok">Em dia</span>`;
  const pending = group.pending > 0 ? `<span class="pill warn">${group.pending} pendente(s)</span>` : "";
  const progress = group.inProgress > 0 ? `<span class="pill work">${group.inProgress} em andamento</span>` : "";

  return `
    <details class="tech-group" open>
      <summary>
        <div class="tech-main">
          <strong>${escapeHtml(group.title)}</strong>
          <span class="meta">${escapeHtml(group.subtitle)}</span>
          <span class="meta">${group.rows.length} chamado(s)</span>
        </div>
        <div class="tech-pills">
          ${pending}
          ${progress}
          ${alerts}
        </div>
      </summary>
      <div class="group-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Titulo</th>
              <th>Tecnico</th>
              <th>Grupo</th>
              <th>Status</th>
              <th>Prioridade</th>
              <th>Solicitante</th>
              <th>Abertura</th>
              <th>Atualizacao</th>
              <th>Prazo SLA</th>
              <th>Atraso</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
}

export function buildMonitorReportHtml(input: BuildMonitorReportInput): string {
  const now = input.generatedAt ?? new Date();
  const rows = buildRows(input.tickets || [], now, input.glpiBaseUrl);
  const groups = groupByResponsibility(rows);

  const groupName = input.groupName || "Todos os grupos";
  const period = input.periodLabel || "-";
  const generatedAt = format(now, "dd/MM/yyyy HH:mm");
  const content =
    groups.length > 0
      ? groups.map(renderGroup).join("")
      : `<div class="empty">Nenhum chamado encontrado para gerar o relatorio.</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GLPI - Relatorio por responsavel</title>
  <style>
    :root {
      --bg: #f2f7f3;
      --surface: #ffffff;
      --border: #c8dece;
      --text: #13271d;
      --muted: #627d6d;
      --brand: #006924;
      --brand-2: #004d1a;
      --red: #dc2626;
      --amber: #d97706;
      --green: #0f8a3a;
      --blue: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.4;
    }
    .header {
      background: linear-gradient(135deg, var(--brand-2), var(--brand));
      color: #fff;
      padding: 20px 28px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .title { font-size: 21px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 12px; opacity: 0.88; }
    .actions { display: flex; gap: 8px; }
    .btn {
      border: 1px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      cursor: pointer;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      padding: 16px 28px 8px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--kpi-color, var(--brand));
      border-radius: 10px;
      padding: 12px 14px;
    }
    .kpi-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
    .kpi-value { font-size: 30px; font-weight: 700; margin-top: 2px; line-height: 1; }
    .kpi-note { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .content { padding: 12px 28px 28px; display: flex; flex-direction: column; gap: 10px; }
    .tech-group {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      overflow: hidden;
    }
    .tech-group summary {
      list-style: none;
      cursor: pointer;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }
    .tech-group summary::-webkit-details-marker { display: none; }
    .tech-main { display: flex; align-items: baseline; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .meta { font-size: 12px; color: var(--muted); }
    .tech-pills { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .group-table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 1280px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e2efe7; font-size: 12px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.5px; background: #f7fbf8; }
    .title-cell { max-width: 420px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .ticket-link { color: #0b5130; text-decoration: none; font-weight: 600; }
    .ticket-link:hover { text-decoration: underline; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 11px;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .pill.ok { background: #e7f8ec; color: #166534; }
    .pill.warn { background: #fff3e3; color: #b45309; }
    .pill.work { background: #e8f1ff; color: #1d4ed8; }
    .pill.alert { background: #ffe7e7; color: #b91c1c; }
    .p-low { background: #ecf5ff; color: #1d4ed8; }
    .p-medium { background: #fff6e7; color: #b45309; }
    .p-high { background: #ffeedd; color: #c2410c; }
    .p-urgent { background: #ffe7e7; color: #b91c1c; }
    .delay { color: var(--muted); }
    .delay.late { color: var(--red); font-weight: 700; }
    .row-late td { background: #fffafa; }
    .tags-cell { min-width: 200px; }
    .tag {
      display: inline-block;
      margin: 0 4px 4px 0;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid #d6e8dc;
      background: #f4faf6;
      font-size: 10px;
      color: #274635;
    }
    .tag.muted { color: var(--muted); }
    .empty {
      border: 1px dashed var(--border);
      background: var(--surface);
      border-radius: 10px;
      padding: 20px;
      color: var(--muted);
      text-align: center;
    }
    .footer {
      padding: 16px 28px 24px;
      color: var(--muted);
      font-size: 11px;
      text-align: center;
    }
    @media print {
      .actions { display: none; }
      body { background: #fff; }
      .header, .kpi-card, .tech-group { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1 class="title">GLPI - Relatorio por responsavel</h1>
      <div class="subtitle">Grupo: ${escapeHtml(groupName)} | Periodo: ${escapeHtml(period)} | Gerado em: ${generatedAt}</div>
    </div>
    <div class="actions">
      <button class="btn" onclick="window.print()">Imprimir / PDF</button>
      <button class="btn" onclick="window.close()">Fechar</button>
    </div>
  </header>

  <section class="kpis">
    ${renderKpis(rows)}
  </section>

  <main class="content">
    ${content}
  </main>

  <footer class="footer">
    Relatorio gerado a partir da consulta atual do Monitor.
  </footer>
</body>
</html>`;
}

export function openMonitorReportInNewTab(reportHtml: string, preparedWindow?: Window | null): boolean {
  const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  if (preparedWindow && !preparedWindow.closed) {
    try {
      preparedWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    } catch {
      // fallback below
    }
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (opened) return true;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `relatorio-glpi-${format(new Date(), "yyyyMMdd-HHmm")}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return false;
}
