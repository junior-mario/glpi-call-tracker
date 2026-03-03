import { AIConfig, AIAnalysisResult, TicketDataForAnalysis } from "@/types/ai";
import { api } from "@/lib/api";

let configCache: AIConfig | null = null;

export async function loadAIConfig(): Promise<AIConfig | null> {
  try {
    const data = await api.get<{
      provider: string;
      base_url: string;
      api_key: string;
      model: string;
    }>("/api/ai-config");
    configCache = {
      provider: data.provider,
      baseUrl: data.base_url,
      apiKey: data.api_key,
      model: data.model,
    };
    return configCache;
  } catch {
    configCache = null;
    return null;
  }
}

export function getAIConfig(): AIConfig | null {
  return configCache;
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await api.put("/api/ai-config", {
    provider: config.provider,
    base_url: config.baseUrl,
    api_key: config.apiKey,
    model: config.model,
  });
  configCache = config;
}

export async function clearAIConfig(): Promise<void> {
  await api.delete("/api/ai-config");
  configCache = null;
}

export async function testAIConfig(): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>("/api/ai-config/test", {});
}

export async function analyzeTicket(
  ticketData: TicketDataForAnalysis,
  forceRefresh = false
): Promise<AIAnalysisResult> {
  return api.post<AIAnalysisResult>("/api/ai/analyze", {
    ticket_data: ticketData,
    force_refresh: forceRefresh,
  });
}

export async function getCachedAnalysis(ticketId: string): Promise<AIAnalysisResult | null> {
  try {
    return await api.get<AIAnalysisResult>(`/api/ai/analyses/${ticketId}`);
  } catch {
    return null;
  }
}

export async function getAllCachedAnalyses(): Promise<AIAnalysisResult[]> {
  try {
    return await api.get<AIAnalysisResult[]>("/api/ai/analyses");
  } catch {
    return [];
  }
}
