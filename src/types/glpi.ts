export interface GLPIConfig {
  baseUrl: string;
  appToken: string;
  userToken: string;
}

export interface GLPISessionResponse {
  session_token: string;
}

export interface GLPITicketResponse {
  id: number;
  name: string;
  content: string;
  status: number;
  priority: number;
  date_creation: string;
  date_mod: string;
  users_id_recipient: number;
  users_id_lastupdater: number;
}

export interface GLPIFollowupResponse {
  id: number;
  content: string;
  date_creation: string;
  users_id: number;
}

export interface GLPISolutionResponse {
  id: number;
  content: string;
  date_creation: string;
  users_id: number;
  status: number;
}

export interface GLPITaskResponse {
  id: number;
  content: string;
  date_creation: string;
  users_id: number;
  state: number;
  is_private: number;
  actiontime: number;
}

export interface GLPIValidationResponse {
  id: number;
  comment_submission: string;
  comment_validation: string;
  date_creation: string;
  date_mod: string;
  users_id: number;
  users_id_validate: number;
  status: number;
}

export interface GLPIDocumentItemResponse {
  id: number;
  documents_id: number;
  date_creation: string;
  users_id: number;
}

export interface GLPIDocumentResponse {
  id: number;
  name: string;
  filename: string;
  date_creation: string;
  users_id: number;
}

export interface GLPIUserResponse {
  id: number;
  name: string;
  realname: string;
  firstname: string;
}

export interface GLPITestResult {
  success: boolean;
  message: string;
  sessionToken?: string;
  ticketData?: GLPITicketResponse;
}

export interface GLPIGroupResponse {
  id: number;
  name: string;
  completename: string;
}

export interface GLPISearchResponse {
  totalcount: number;
  count: number;
  sort: number;
  order: string;
  data: Record<string, string | number | null>[];
}

export interface MonitorTicket {
  id: number;
  name: string;
  status: number;
  priority: number;
  date: string;
  date_mod: string;
}
