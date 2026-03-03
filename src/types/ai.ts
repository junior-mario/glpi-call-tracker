export interface AIProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.5-flash",
    models: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "google/gemini-2.0-flash-001", "anthropic/claude-sonnet-4", "openai/gpt-4o-mini", "meta-llama/llama-4-scout"],
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "gpt-4.1"],
  },
  {
    id: "custom",
    label: "Customizado",
    baseUrl: "",
    defaultModel: "",
    models: [],
  },
];

export interface AIConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AIConfigInput {
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
}

export interface AIAnalysisResult {
  id: number;
  ticket_id: string;
  analysis_text: string;
  model_used: string;
  created_at: string;
  cached: boolean;
}

export interface TicketDataForAnalysis {
  id: string;
  title: string;
  status: string;
  priority: string;
  requester: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  updates: {
    date: string;
    author: string;
    content: string;
    type: string;
  }[];
}
