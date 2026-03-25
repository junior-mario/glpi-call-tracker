import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Settings, TestTube, CheckCircle, XCircle, Loader2, Eye, EyeOff, Save, Trash2, Timer, LayoutDashboard } from "lucide-react";
import { GLPIConfig, GLPITestResult, GLPIGroupResponse, GLPIDebugMethod, GLPIDebugQueryResult } from "@/types/glpi";
import { loadGLPIConfig, saveGLPIConfig, clearGLPIConfig, testGLPIConnection, fetchGLPIGroups, runGLPIDebugQuery } from "@/services/glpiService";

interface ConfigPanelProps {
  onConfigSaved: () => void;
}

function formatDebugResult(result: GLPIDebugQueryResult): string {
  const headers = Object.entries(result.responseHeaders)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const payload =
    result.responseJson !== null
      ? JSON.stringify(result.responseJson, null, 2)
      : result.responseText || "(vazio)";

  const body =
    result.requestBody !== null
      ? JSON.stringify(result.requestBody, null, 2)
      : "(sem body)";

  return [
    `ok: ${result.ok}`,
    `status: ${result.status} ${result.statusText}`,
    `metodo: ${result.method}`,
    `url-final: ${result.url}`,
    `content-type: ${result.contentType || "n/a"}`,
    "",
    "request-body:",
    body,
    "",
    "response-headers:",
    headers || "(sem headers)",
    "",
    "response-payload:",
    payload.length > 20000 ? `${payload.slice(0, 20000)}\n\n...[truncado]...` : payload,
  ].join("\n");
}

export function ConfigPanel({ onConfigSaved }: ConfigPanelProps) {
  const [config, setConfig] = useState<GLPIConfig>({
    baseUrl: "",
    appToken: "",
    userToken: "",
    pollInterval: 10,
  });
  const [testTicketId, setTestTicketId] = useState("");
  const [showAppToken, setShowAppToken] = useState(false);
  const [showUserToken, setShowUserToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<GLPITestResult | null>(null);
  const [hasConfig, setHasConfig] = useState(false);
  const [groups, setGroups] = useState<GLPIGroupResponse[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [overviewGroup, setOverviewGroup] = useState<string>("all");
  const [overviewDays, setOverviewDays] = useState<number | "">(30);

  const [debugMethod, setDebugMethod] = useState<GLPIDebugMethod>("GET");
  const [debugEndpoint, setDebugEndpoint] = useState("/Group");
  const [debugQueryString, setDebugQueryString] = useState("range=0-5&order=ASC");
  const [debugBodyJson, setDebugBodyJson] = useState('{"criteria":[{"field":"12","searchtype":"equals","value":"2"}]}');
  const [isDebugRunning, setIsDebugRunning] = useState(false);
  const [debugOutput, setDebugOutput] = useState("");

  useEffect(() => {
    loadGLPIConfig().then((savedConfig) => {
      if (savedConfig) {
        setConfig(savedConfig);
        setHasConfig(true);
        setOverviewGroup(savedConfig.overviewGroupId ? String(savedConfig.overviewGroupId) : "all");
        setOverviewDays(savedConfig.overviewDays ?? "");

        setIsLoadingGroups(true);
        fetchGLPIGroups()
          .then(setGroups)
          .catch(() => {})
          .finally(() => setIsLoadingGroups(false));
      }
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const toSave: GLPIConfig = {
        ...config,
        overviewGroupId: overviewGroup && overviewGroup !== "all" ? Number(overviewGroup) : null,
        overviewDays: typeof overviewDays === "number" && overviewDays > 0 ? overviewDays : null,
      };
      await saveGLPIConfig(toSave);
      setConfig(toSave);
      setHasConfig(true);
      onConfigSaved();
    } catch (error) {
      console.error("Erro ao salvar configuracao:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    await clearGLPIConfig();
    setConfig({
      baseUrl: "",
      appToken: "",
      userToken: "",
      pollInterval: 10,
    });
    setHasConfig(false);
    setTestResult(null);

    setDebugOutput("");
    setDebugMethod("GET");
    setDebugEndpoint("/Group");
    setDebugQueryString("range=0-5&order=ASC");
    setDebugBodyJson('{"criteria":[{"field":"12","searchtype":"equals","value":"2"}]}');
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    const result = await testGLPIConnection(config, testTicketId || undefined);
    setTestResult(result);
    setIsTesting(false);
  };

  const isConfigValid = Boolean(config.baseUrl && config.appToken && config.userToken);

  const handleDebugQuery = async () => {
    if (!isConfigValid) return;

    setIsDebugRunning(true);
    setDebugOutput("");

    try {
      const result = await runGLPIDebugQuery(config, {
        method: debugMethod,
        endpoint: debugEndpoint,
        queryString: debugQueryString,
        bodyJson: debugBodyJson,
      });
      setDebugOutput(formatDebugResult(result));
    } catch (error) {
      setDebugOutput(`Erro ao executar consulta: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    } finally {
      setIsDebugRunning(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="h-5 w-5 text-primary" />
          Configuracao da API GLPI
        </CardTitle>
        <CardDescription>
          Configure os parametros de conexao com a API do GLPI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="baseUrl">URL Base da API</Label>
          <Input
            id="baseUrl"
            placeholder="https://seu-servidor-glpi.com"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value.replace(/\/+$/, "").replace(/\/apirest\.php$/i, "") })}
          />
          <p className="text-xs text-muted-foreground">
            Apenas a URL do servidor GLPI, sem /apirest.php (ex: https://glpi.empresa.com)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="appToken">App Token</Label>
          <div className="relative">
            <Input
              id="appToken"
              type={showAppToken ? "text" : "password"}
              placeholder="Token da aplicacao"
              value={config.appToken}
              onChange={(e) => setConfig({ ...config, appToken: e.target.value })}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowAppToken(!showAppToken)}
            >
              {showAppToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Token gerado em Configuracao -&gt; Geral -&gt; API -&gt; Token de aplicacao cliente
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="userToken">User Token</Label>
          <div className="relative">
            <Input
              id="userToken"
              type={showUserToken ? "text" : "password"}
              placeholder="Token do usuario"
              value={config.userToken}
              onChange={(e) => setConfig({ ...config, userToken: e.target.value })}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowUserToken(!showUserToken)}
            >
              {showUserToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Token pessoal em Minhas configuracoes -&gt; Controle remoto -&gt; Token de acesso pessoal
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Intervalo de atualizacao (minutos)
          </Label>
          <div className="flex gap-2">
            {[5, 10, 15, 30].map((v) => (
              <Button
                key={v}
                type="button"
                variant={config.pollInterval === v ? "default" : "outline"}
                size="sm"
                onClick={() => setConfig({ ...config, pollInterval: v })}
              >
                {v}
              </Button>
            ))}
            <Input
              type="number"
              min={1}
              max={120}
              className="w-20"
              value={config.pollInterval ?? 10}
              onChange={(e) => setConfig({ ...config, pollInterval: Math.max(1, Number(e.target.value) || 10) })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Frequencia com que os chamados monitorados sao atualizados automaticamente
          </p>
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            Visao Geral do Dashboard
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure o grupo e o periodo para a aba "Visao Geral" do Dashboard.
          </p>

          <div className="space-y-2">
            <Label>Grupo Tecnico</Label>
            <Select
              value={overviewGroup}
              onValueChange={setOverviewGroup}
              disabled={isLoadingGroups || !hasConfig}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingGroups ? "Carregando..." : "Todos os grupos"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.completename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Periodo</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ultimos</span>
              <Input
                type="number"
                min={1}
                max={365}
                className="w-20"
                disabled={!hasConfig}
                value={overviewDays}
                onChange={(e) => {
                  const v = e.target.value;
                  setOverviewDays(v === "" ? "" : Math.max(1, Number(v) || 1));
                }}
              />
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
            <div className="flex gap-2">
              {[7, 15, 30, 60, 90].map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant={overviewDays === v ? "default" : "outline"}
                  size="sm"
                  disabled={!hasConfig}
                  onClick={() => setOverviewDays(v)}
                >
                  {v}d
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={!isConfigValid || isSaving} className="flex-1">
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configuracao
          </Button>
          {hasConfig && (
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="font-medium text-sm">Testar Conexao</h4>

          <div className="space-y-2">
            <Label htmlFor="testTicketId">Numero do Chamado (opcional)</Label>
            <Input
              id="testTicketId"
              placeholder="Ex: 1234"
              value={testTicketId}
              onChange={(e) => setTestTicketId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Informe um numero de chamado para testar a busca completa
            </p>
          </div>

          <Button
            onClick={handleTest}
            disabled={!isConfigValid || isTesting}
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
                Testar Conexao
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
                {testResult.success ? "Sucesso!" : "Erro na Conexao"}
              </AlertTitle>
              <AlertDescription className="mt-2">
                {testResult.message}
                {testResult.ticketData && (
                  <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                    <p><strong>ID:</strong> {testResult.ticketData.id}</p>
                    <p><strong>Titulo:</strong> {testResult.ticketData.name}</p>
                    <p><strong>Status:</strong> {testResult.ticketData.status}</p>
                    <p><strong>Prioridade:</strong> {testResult.ticketData.priority}</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="font-medium text-sm">Console de consulta da API (debug)</h4>
          <p className="text-xs text-muted-foreground">
            Execute consultas manuais na API do GLPI para inspecionar status HTTP, headers e payload bruto.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="debugMethod">Metodo</Label>
              <Select
                value={debugMethod}
                onValueChange={(value) => setDebugMethod(value as GLPIDebugMethod)}
                disabled={!isConfigValid || isDebugRunning}
              >
                <SelectTrigger id="debugMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="debugEndpoint">Endpoint</Label>
              <Input
                id="debugEndpoint"
                placeholder="/Group"
                value={debugEndpoint}
                disabled={isDebugRunning}
                onChange={(e) => setDebugEndpoint(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="debugQuery">Query string (opcional)</Label>
            <Input
              id="debugQuery"
              placeholder="Ex: range=0-50&order=ASC"
              value={debugQueryString}
              disabled={isDebugRunning}
              onChange={(e) => setDebugQueryString(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="debugBody">Body JSON (opcional)</Label>
            <Textarea
              id="debugBody"
              className="min-h-[110px] font-mono text-xs"
              placeholder='{"criteria":[{"field":"12","searchtype":"equals","value":"2"}]}'
              value={debugBodyJson}
              disabled={isDebugRunning}
              onChange={(e) => setDebugBodyJson(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              O body e ignorado para metodos GET e DELETE.
            </p>
          </div>

          <Button
            onClick={handleDebugQuery}
            disabled={!isConfigValid || isDebugRunning}
            variant="secondary"
            className="w-full"
          >
            {isDebugRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Executar consulta
              </>
            )}
          </Button>

          <div className="space-y-2">
            <Label htmlFor="debugOutput">Retorno da consulta</Label>
            <Textarea
              id="debugOutput"
              readOnly
              className="min-h-[220px] font-mono text-xs"
              value={debugOutput}
              placeholder="Resultado detalhado da consulta aparecera aqui..."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

