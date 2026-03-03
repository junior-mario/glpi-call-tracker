import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, TestTube, CheckCircle, XCircle, Loader2, Eye, EyeOff, Save, Trash2 } from "lucide-react";
import { AIConfig, AI_PROVIDER_PRESETS } from "@/types/ai";
import { loadAIConfig, saveAIConfig, clearAIConfig, testAIConfig } from "@/services/aiService";

export function AIConfigPanel() {
  const [provider, setProvider] = useState("gemini");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    loadAIConfig().then((config) => {
      if (config) {
        setProvider(config.provider);
        setBaseUrl(config.baseUrl);
        setApiKey(config.apiKey);
        setModel(config.model);
        setHasConfig(true);
      }
    });
  }, []);

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === value);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
  };

  const selectedPreset = AI_PROVIDER_PRESETS.find((p) => p.id === provider);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAIConfig({ provider, baseUrl, apiKey, model });
      setHasConfig(true);
    } catch (error) {
      console.error("Erro ao salvar config IA:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    await clearAIConfig();
    setProvider("gemini");
    setBaseUrl("");
    setApiKey("");
    setModel("");
    setHasConfig(false);
    setTestResult(null);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testAIConfig();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isValid = baseUrl && apiKey && model;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          Configuração de IA
        </CardTitle>
        <CardDescription>
          Configure o provedor de IA para análise de chamados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider */}
        <div className="space-y-2">
          <Label>Provedor</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDER_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              placeholder="Chave de API do provedor"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Model */}
        <div className="space-y-2">
          <Label>Modelo</Label>
          {selectedPreset && selectedPreset.models.length > 0 ? (
            <>
              <Select value={selectedPreset.models.includes(model) ? model : "__custom__"} onValueChange={(v) => { if (v !== "__custom__") setModel(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPreset.models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Outro (digitar)</SelectItem>
                </SelectContent>
              </Select>
              {!selectedPreset.models.includes(model) && (
                <Input
                  placeholder="Nome do modelo customizado"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              )}
            </>
          ) : (
            <Input
              placeholder="Nome do modelo (ex: gpt-4o-mini)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          )}
        </div>

        {/* Base URL */}
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            placeholder="https://api.exemplo.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value.replace(/\/+$/, ""))}
            disabled={provider !== "custom"}
          />
          <p className="text-xs text-muted-foreground">
            URL base da API (compatível com OpenAI). Preenchido automaticamente pelo preset.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={!isValid || isSaving} className="flex-1">
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
          {hasConfig && (
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          )}
        </div>

        <Separator />

        {/* Test */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Testar Conexão</h4>
          <Button
            onClick={handleTest}
            disabled={!hasConfig || isTesting}
            variant="secondary"
            className="w-full"
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Testar Conexão
              </>
            )}
          </Button>

          {testResult && (
            <Alert variant={testResult.success ? "default" : "destructive"}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {testResult.success ? "Sucesso!" : "Erro na Conexão"}
              </AlertTitle>
              <AlertDescription className="mt-2">
                {testResult.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
