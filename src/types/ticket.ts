export type TicketStatus = 'new' | 'pending' | 'in-progress' | 'resolved' | 'closed';

export interface TicketUpdate {
  id: string;
  date: string;
  author: string;
  content: string;
  type: 'comment' | 'status_change' | 'assignment' | 'solution' | 'task' | 'validation';
}

export interface Ticket {
  id: string;
  title: string;
  status: TicketStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string;
  requester: string;
  createdAt: string;
  updatedAt: string;
  hasNewUpdates: boolean;
  updates: TicketUpdate[];
}
