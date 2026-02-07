import { GLPIConfig, GLPISessionResponse, GLPITicketResponse, GLPIFollowupResponse, GLPISolutionResponse, GLPITaskResponse, GLPIValidationResponse, GLPIDocumentItemResponse, GLPIDocumentResponse, GLPIUserResponse, GLPITestResult } from "@/types/glpi";
import { Ticket, TicketStatus, TicketUpdate } from "@/types/ticket";

const CONFIG_KEY = "glpi-api-config";

export function saveGLPIConfig(config: GLPIConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function getGLPIConfig(): GLPIConfig | null {
  const saved = localStorage.getItem(CONFIG_KEY);
  return saved ? JSON.parse(saved) : null;
}

export function clearGLPIConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

// Normalizes the base URL: removes trailing slash and /apirest.php if present
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/apirest\.php$/i, "");
}

// Returns the API base URL, using the Vite proxy in development to avoid CORS
function getApiBaseUrl(config: GLPIConfig): string {
  if (import.meta.env.DEV && import.meta.env.VITE_GLPI_URL) {
    return "/glpi-api";
  }
  return normalizeBaseUrl(config.baseUrl);
}

// Decodes HTML entities (&#60; -> <, &amp; -> &, etc.)
// Uses textarea trick: setting innerHTML decodes entities, .value returns decoded text
function decodeEntities(html: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
}

// Decodes HTML entities and strips ALL tags — used for plain-text fields (title)
function stripHtml(html: string): string {
  const decoded = decodeEntities(html);
  const doc = new DOMParser().parseFromString(decoded, "text/html");
  return doc.body.textContent?.trim() || "";
}

// Sanitizes HTML keeping only safe tags — used for rich-text content (timeline)
const ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "A", "SPAN",
  "UL", "OL", "LI", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "IMG",
]);
const ALLOWED_ATTRS: Record<string, string[]> = {
  A: ["href", "target", "rel"],
  SPAN: ["style"],
  IMG: ["src", "alt", "width", "height"],
  TD: ["colspan", "rowspan"],
  TH: ["colspan", "rowspan"],
};

function sanitizeNode(node: Node, out: HTMLElement): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(child.cloneNode(true));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (ALLOWED_TAGS.has(el.tagName)) {
        const clean = document.createElement(el.tagName);
        for (const attr of ALLOWED_ATTRS[el.tagName] || []) {
          const val = el.getAttribute(attr);
          if (val && !(attr === "href" && val.toLowerCase().trimStart().startsWith("javascript:"))) {
            clean.setAttribute(attr, val);
          }
        }
        if (el.tagName === "A") clean.setAttribute("target", "_blank");
        sanitizeNode(el, clean);
        out.appendChild(clean);
      } else {
        sanitizeNode(el, out);
      }
    }
  }
}

function sanitizeHtml(html: string): string {
  const decoded = decodeEntities(html);
  const doc = new DOMParser().parseFromString(decoded, "text/html");
  const container = document.createElement("div");
  sanitizeNode(doc.body, container);
  return container.innerHTML;
}

function parseGLPIError(data: unknown): string {
  if (Array.isArray(data)) {
    return `${data[0]}${data[1] ? `: ${data[1]}` : ""}`;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    // Array-like object: {"0": "ERROR_CODE", "1": "message"}
    if ("0" in obj) {
      return `${obj["0"]}${obj["1"] ? `: ${obj["1"]}` : ""}`;
    }
    // Standard object: {"error": "...", "message": "..."}
    if ("message" in obj) return String(obj.message);
    if ("error" in obj) return String(obj.error);
  }
  return "";
}

// Map GLPI status codes to our status
function mapGLPIStatus(status: number): TicketStatus {
  switch (status) {
    case 1: return "new";
    case 2: return "in-progress";
    case 3: return "pending";
    case 4: return "pending";
    case 5: return "resolved";
    case 6: return "closed";
    default: return "new";
  }
}

// Map GLPI priority codes to our priority
function mapGLPIPriority(priority: number): Ticket["priority"] {
  switch (priority) {
    case 1: return "low";
    case 2: return "low";
    case 3: return "medium";
    case 4: return "high";
    case 5: return "urgent";
    case 6: return "urgent";
    default: return "medium";
  }
}

async function initSession(config: GLPIConfig): Promise<string> {
  const response = await fetch(`${getApiBaseUrl(config)}/apirest.php/initSession`, {
    method: "GET",
    headers: {
      "App-Token": config.appToken,
      "Authorization": `user_token ${config.userToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = parseGLPIError(body);
    throw new Error(detail || `Erro ao iniciar sessão (HTTP ${response.status})`);
  }

  const data: GLPISessionResponse = await response.json();
  return data.session_token;
}

async function killSession(config: GLPIConfig, sessionToken: string): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl(config)}/apirest.php/killSession`, {
      method: "GET",
      headers: {
        "App-Token": config.appToken,
        "Session-Token": sessionToken,
      },
    });
  } catch {
    // Ignore errors when killing session
  }
}

// Cached user name resolver to avoid duplicate API calls
function createUserResolver(config: GLPIConfig, sessionToken: string) {
  const cache = new Map<number, Promise<string>>();

  return (userId: number): Promise<string> => {
    if (!userId) return Promise.resolve("Usuário desconhecido");

    const cached = cache.get(userId);
    if (cached) return cached;

    const promise = (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl(config)}/apirest.php/User/${userId}`, {
          method: "GET",
          headers: {
            "App-Token": config.appToken,
            "Session-Token": sessionToken,
          },
        });

        if (!response.ok) return "Usuário desconhecido";

        const data: GLPIUserResponse = await response.json();
        return data.firstname && data.realname
          ? `${data.firstname} ${data.realname}`
          : data.name;
      } catch {
        return "Usuário desconhecido";
      }
    })();

    cache.set(userId, promise);
    return promise;
  };
}

// GLPI Ticket_User type: 1=Requester, 2=Assigned, 3=Observer
async function getTicketAssignee(
  config: GLPIConfig,
  sessionToken: string,
  ticketId: string
): Promise<number | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl(config)}/apirest.php/Ticket/${ticketId}/Ticket_User`,
      {
        method: "GET",
        headers: {
          "App-Token": config.appToken,
          "Session-Token": sessionToken,
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data)) return null;

    const assigned = data.find((entry: { type: number }) => entry.type === 2);
    return assigned ? assigned.users_id : null;
  } catch {
    return null;
  }
}

// Generic helper to fetch a ticket sub-item list
async function getTicketSubItems<T>(
  config: GLPIConfig,
  sessionToken: string,
  ticketId: string,
  subItemType: string
): Promise<T[]> {
  try {
    const response = await fetch(
      `${getApiBaseUrl(config)}/apirest.php/Ticket/${ticketId}/${subItemType}`,
      {
        method: "GET",
        headers: {
          "App-Token": config.appToken,
          "Session-Token": sessionToken,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function getDocument(
  config: GLPIConfig,
  sessionToken: string,
  documentId: number
): Promise<GLPIDocumentResponse | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl(config)}/apirest.php/Document/${documentId}`,
      {
        method: "GET",
        headers: {
          "App-Token": config.appToken,
          "Session-Token": sessionToken,
        },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot !== -1 ? filename.substring(dot) : filename;
}

export async function testGLPIConnection(config: GLPIConfig, testTicketId?: string): Promise<GLPITestResult> {
  try {
    const sessionToken = await initSession(config);
    
    let ticketData: GLPITicketResponse | undefined;
    
    if (testTicketId) {
      const response = await fetch(`${getApiBaseUrl(config)}/apirest.php/Ticket/${testTicketId}`, {
        method: "GET",
        headers: {
          "App-Token": config.appToken,
          "Session-Token": sessionToken,
        },
      });

      if (response.ok) {
        ticketData = await response.json();
      }
    }

    await killSession(config, sessionToken);

    return {
      success: true,
      message: ticketData 
        ? `Conexão bem-sucedida! Chamado "${ticketData.name}" encontrado.`
        : "Conexão bem-sucedida! Autenticação funcionando.",
      sessionToken,
      ticketData,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro desconhecido ao conectar",
    };
  }
}

export async function fetchGLPITicket(ticketId: string): Promise<Ticket | null> {
  const config = getGLPIConfig();
  if (!config) {
    throw new Error("Configuração da API GLPI não encontrada");
  }

  const sessionToken = await initSession(config);
  const resolveUser = createUserResolver(config, sessionToken);

  try {
    // Fetch ticket data
    const ticketResponse = await fetch(`${getApiBaseUrl(config)}/apirest.php/Ticket/${ticketId}`, {
      method: "GET",
      headers: {
        "App-Token": config.appToken,
        "Session-Token": sessionToken,
      },
    });

    if (!ticketResponse.ok) {
      if (ticketResponse.status === 404) return null;
      const body = await ticketResponse.json().catch(() => null);
      const detail = parseGLPIError(body);
      throw new Error(detail || `Erro ao buscar chamado (HTTP ${ticketResponse.status})`);
    }

    const ticketData: GLPITicketResponse = await ticketResponse.json();

    // Fetch all sub-items in parallel
    const [followups, solutions, tasks, validations, documentItems, assigneeUserId] = await Promise.all([
      getTicketSubItems<GLPIFollowupResponse>(config, sessionToken, ticketId, "ITILFollowup"),
      getTicketSubItems<GLPISolutionResponse>(config, sessionToken, ticketId, "ITILSolution"),
      getTicketSubItems<GLPITaskResponse>(config, sessionToken, ticketId, "TicketTask"),
      getTicketSubItems<GLPIValidationResponse>(config, sessionToken, ticketId, "TicketValidation"),
      getTicketSubItems<GLPIDocumentItemResponse>(config, sessionToken, ticketId, "Document_Item"),
      getTicketAssignee(config, sessionToken, ticketId),
    ]);

    // Resolve requester and assignee names
    const [requesterName, assigneeName] = await Promise.all([
      resolveUser(ticketData.users_id_recipient),
      assigneeUserId ? resolveUser(assigneeUserId) : Promise.resolve("Não atribuído"),
    ]);

    // Build updates array from all interaction types
    const updates: TicketUpdate[] = [];

    // Ticket description as first entry
    if (ticketData.content) {
      const openerName = await resolveUser(ticketData.users_id_recipient);
      updates.push({
        id: `desc`,
        date: ticketData.date_creation,
        author: openerName,
        content: sanitizeHtml(ticketData.content),
        type: "comment",
      });
    }

    // Followups (comments)
    for (const f of followups) {
      updates.push({
        id: `followup-${f.id}`,
        date: f.date_creation,
        author: await resolveUser(f.users_id),
        content: sanitizeHtml(f.content),
        type: "comment",
      });
    }

    // Solutions
    for (const s of solutions) {
      updates.push({
        id: `solution-${s.id}`,
        date: s.date_creation,
        author: await resolveUser(s.users_id),
        content: sanitizeHtml(s.content),
        type: "solution",
      });
    }

    // Tasks
    for (const t of tasks) {
      updates.push({
        id: `task-${t.id}`,
        date: t.date_creation,
        author: await resolveUser(t.users_id),
        content: sanitizeHtml(t.content),
        type: "task",
      });
    }

    // Validations
    for (const v of validations) {
      const submitter = await resolveUser(v.users_id);
      const validator = await resolveUser(v.users_id_validate);
      const comment = v.comment_validation
        ? sanitizeHtml(v.comment_validation)
        : sanitizeHtml(v.comment_submission);
      updates.push({
        id: `validation-${v.id}`,
        date: v.date_mod || v.date_creation,
        author: v.comment_validation ? validator : submitter,
        content: comment || `Validação solicitada por ${submitter} para ${validator}`,
        type: "validation",
      });
    }

    // Attachments
    for (const di of documentItems) {
      const doc = await getDocument(config, sessionToken, di.documents_id);
      if (doc) {
        const ext = getFileExtension(doc.filename);
        updates.push({
          id: `doc-${di.id}`,
          date: di.date_creation || doc.date_creation,
          author: await resolveUser(di.users_id || doc.users_id),
          content: `Anexo ${ext}`,
          type: "attachment",
        });
      }
    }

    // Sort updates by date (newest first)
    updates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const ticket: Ticket = {
      id: String(ticketData.id),
      title: stripHtml(ticketData.name),
      status: mapGLPIStatus(ticketData.status),
      priority: mapGLPIPriority(ticketData.priority),
      assignee: assigneeName,
      requester: requesterName,
      createdAt: ticketData.date_creation,
      updatedAt: ticketData.date_mod,
      hasNewUpdates: false,
      updates,
    };

    return ticket;
  } finally {
    await killSession(config, sessionToken);
  }
}
