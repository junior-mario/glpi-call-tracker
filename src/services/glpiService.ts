import { GLPIConfig, GLPISessionResponse, GLPITicketResponse, GLPIFollowupResponse, GLPIUserResponse, GLPITestResult } from "@/types/glpi";
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
  const response = await fetch(`${config.baseUrl}/apirest.php/initSession`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "App-Token": config.appToken,
      "Authorization": `user_token ${config.userToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Erro ao iniciar sessão: ${response.status}`);
  }

  const data: GLPISessionResponse = await response.json();
  return data.session_token;
}

async function killSession(config: GLPIConfig, sessionToken: string): Promise<void> {
  try {
    await fetch(`${config.baseUrl}/apirest.php/killSession`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "App-Token": config.appToken,
        "Session-Token": sessionToken,
      },
    });
  } catch {
    // Ignore errors when killing session
  }
}

async function getUser(config: GLPIConfig, sessionToken: string, userId: number): Promise<string> {
  try {
    const response = await fetch(`${config.baseUrl}/apirest.php/User/${userId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
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
}

async function getTicketFollowups(
  config: GLPIConfig, 
  sessionToken: string, 
  ticketId: string
): Promise<GLPIFollowupResponse[]> {
  try {
    const response = await fetch(
      `${config.baseUrl}/apirest.php/Ticket/${ticketId}/ITILFollowup`, 
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
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

export async function testGLPIConnection(config: GLPIConfig, testTicketId?: string): Promise<GLPITestResult> {
  try {
    const sessionToken = await initSession(config);
    
    let ticketData: GLPITicketResponse | undefined;
    
    if (testTicketId) {
      const response = await fetch(`${config.baseUrl}/apirest.php/Ticket/${testTicketId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
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

  try {
    // Fetch ticket data
    const ticketResponse = await fetch(`${config.baseUrl}/apirest.php/Ticket/${ticketId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "App-Token": config.appToken,
        "Session-Token": sessionToken,
      },
    });

    if (!ticketResponse.ok) {
      if (ticketResponse.status === 404) return null;
      throw new Error(`Erro ao buscar chamado: ${ticketResponse.status}`);
    }

    const ticketData: GLPITicketResponse = await ticketResponse.json();

    // Fetch followups
    const followups = await getTicketFollowups(config, sessionToken, ticketId);

    // Get user names
    const requesterName = await getUser(config, sessionToken, ticketData.users_id_recipient);
    const assigneeName = ticketData.users_id_lastupdater 
      ? await getUser(config, sessionToken, ticketData.users_id_lastupdater)
      : "Não atribuído";

    // Build updates array
    const updates: TicketUpdate[] = [];

    // Add followups as comments
    for (const followup of followups) {
      const authorName = await getUser(config, sessionToken, followup.users_id);
      updates.push({
        id: `f${followup.id}`,
        date: followup.date_creation,
        author: authorName,
        content: followup.content.replace(/<[^>]*>/g, ''), // Strip HTML tags
        type: "comment",
      });
    }

    // Sort updates by date (newest first)
    updates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const ticket: Ticket = {
      id: String(ticketData.id),
      title: ticketData.name,
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
