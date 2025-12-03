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
