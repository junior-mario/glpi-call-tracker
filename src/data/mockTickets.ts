import { Ticket } from "@/types/ticket";

export const mockTicketData: Record<string, Ticket> = {
  "1001": {
    id: "1001",
    title: "Computador não liga após atualização do Windows",
    status: "in-progress",
    priority: "high",
    assignee: "Carlos Silva",
    requester: "Maria Santos",
    createdAt: "2024-01-15T09:00:00Z",
    updatedAt: "2024-01-17T14:30:00Z",
    hasNewUpdates: true,
    updates: [
      {
        id: "u1",
        date: "2024-01-17T14:30:00Z",
        author: "Carlos Silva",
        content: "Realizei diagnóstico remoto. O problema parece ser relacionado a um driver de vídeo incompatível. Vou agendar uma visita técnica.",
        type: "comment",
      },
      {
        id: "u2",
        date: "2024-01-16T10:00:00Z",
        author: "Sistema",
        content: "Status alterado de 'Novo' para 'Em Andamento'",
        type: "status_change",
      },
      {
        id: "u3",
        date: "2024-01-16T09:45:00Z",
        author: "Sistema",
        content: "Chamado atribuído para Carlos Silva",
        type: "assignment",
      },
      {
        id: "u4",
        date: "2024-01-15T09:00:00Z",
        author: "Maria Santos",
        content: "Meu computador não liga mais depois da atualização do Windows de ontem. A tela fica preta após o logo da Dell.",
        type: "comment",
      },
    ],
  },
  "1002": {
    id: "1002",
    title: "Solicitação de acesso ao sistema ERP",
    status: "pending",
    priority: "medium",
    assignee: "Ana Oliveira",
    requester: "João Pereira",
    createdAt: "2024-01-14T11:30:00Z",
    updatedAt: "2024-01-16T16:00:00Z",
    hasNewUpdates: false,
    updates: [
      {
        id: "u5",
        date: "2024-01-16T16:00:00Z",
        author: "Ana Oliveira",
        content: "Aguardando aprovação do gestor direto para liberar o acesso. Email enviado para o Sr. Roberto Costa.",
        type: "comment",
      },
      {
        id: "u6",
        date: "2024-01-15T08:30:00Z",
        author: "Sistema",
        content: "Chamado atribuído para Ana Oliveira",
        type: "assignment",
      },
    ],
  },
  "1003": {
    id: "1003",
    title: "Impressora do setor financeiro não imprime",
    status: "resolved",
    priority: "low",
    assignee: "Pedro Mendes",
    requester: "Lucia Fernandes",
    createdAt: "2024-01-10T14:00:00Z",
    updatedAt: "2024-01-12T11:00:00Z",
    hasNewUpdates: true,
    updates: [
      {
        id: "u7",
        date: "2024-01-12T11:00:00Z",
        author: "Pedro Mendes",
        content: "Problema resolvido. O driver estava corrompido. Realizei a reinstalação e a impressora está funcionando normalmente.",
        type: "solution",
      },
      {
        id: "u8",
        date: "2024-01-12T11:00:00Z",
        author: "Sistema",
        content: "Status alterado de 'Em Andamento' para 'Resolvido'",
        type: "status_change",
      },
      {
        id: "u9",
        date: "2024-01-11T09:00:00Z",
        author: "Pedro Mendes",
        content: "Iniciando análise do problema. Vou verificar a conectividade e os drivers.",
        type: "comment",
      },
    ],
  },
  "1004": {
    id: "1004",
    title: "Lentidão no sistema de vendas",
    status: "new",
    priority: "urgent",
    assignee: "Não atribuído",
    requester: "Fernando Lima",
    createdAt: "2024-01-17T08:00:00Z",
    updatedAt: "2024-01-17T08:00:00Z",
    hasNewUpdates: false,
    updates: [
      {
        id: "u10",
        date: "2024-01-17T08:00:00Z",
        author: "Fernando Lima",
        content: "O sistema de vendas está muito lento desde ontem à tarde. Várias vendas estão sendo perdidas por causa do tempo de resposta. URGENTE!",
        type: "comment",
      },
    ],
  },
};

export function getTicketById(id: string): Promise<Ticket | null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTicketData[id] || null);
    }, 800);
  });
}
