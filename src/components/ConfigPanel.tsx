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
import { Settings, TestTube, CheckCircle, XCircle, Loader2, Eye, EyeOff, Save, Trash2, Timer, LayoutDashboard } from "lucide-react";
import { GLPIConfig, GLPITestResult, GLPIGroupResponse } from "@/types/glpi";
import { loadGLPIConfig, saveGLPIConfig, clearGLPIConfig, testGLPIConnection, fetchGLPIGroups } from "@/services/glpiService";

interface ConfigPanelProps {
  onConfigSaved: () => void;
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

  useEffect(() => {
    loadGLPIConfig().then((savedConfig) => {
      if (savedConfig) {
        setConfig(savedConfig);
        setHasConfig(true);
        setOverviewGroup(savedConfig.overviewGroupId ? String(savedConfig.overviewGroupId) : "all");
        setOverviewDays(savedConfig.overviewDays ?? "");
        // Load groups once we know config exists
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
      console.error("Erro ao salvar configuração:", error);
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
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    const result = await testGLPIConnection(config, testTicketId || undefined);
    setTestResult(result);
    setIsTesting(false);
  };

  const isConfigValid = config.baseUrl && config.appToken && config.userToken;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="h-5 w-5 text-primary" />
          Configuração da API GLPI
        </CardTitle>
        <CardDescription>
          Configure os parâmetros de conexão com a API do GLPI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base URL */}
        <div className="space-y-2">
          <Label htmlFor="baseUrl">URL Base da API</Label>
          <Input
            id="baseUrl"
            placeholder="https://seu-servidor-glpi.com"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value.replace(/\/+$/, '').replace(/\/apirest\.php$/i, '') })}
          />
          <p className="text-xs text-muted-foreground">
            Apenas a URL do servidor GLPI, sem /apirest.php (ex: https://glpi.empresa.com)
          </p>
        </div>

        {/* App Token */}
        <div className="space-y-2">
          <Label htmlFor="appToken">App Token</Label>
          <div className="relative">
            <Input
              id="appToken"
              type={showAppToken ? "text" : "password"}
              placeholder="Token da aplicação"
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
            Token gerado em Configuração → Geral → API → Token de aplicação cliente
          </p>
        </div>

        {/* User Token */}
        <div className="space-y-2">
          <Label htmlFor="userToken">User Token</Label>
          <div className="relative">
            <Input
              id="userToken"
              type={showUserToken ? "text" : "password"}
              placeholder="Token do usuário"
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
            Token pessoal em Minhas configurações → Controle remoto → Token de acesso pessoal
          </p>
        </div>

        <Separator />

        {/* Poll Interval */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Intervalo de atualização (minutos)
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
            Frequência com que os chamados monitorados são atualizados automaticamente
          </p>
        </div>

        <Separator />

        {/* Overview Settings */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            Visão Geral do Dashboard
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure o grupo e o período para a aba "Visão Geral" do Dashboard.
          </p>

          <div className="space-y-2">
            <Label>Grupo Técnico</Label>
            <Select
              value={overviewGroup}
              onValueChange={setOverviewGroup}
              disabled={isLoadingGroups || !hasConfig}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={isLoadingGroups ? "Carregando..." : "Todos os grupos"}
                />
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
            <Label>Período</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Últimos</span>
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

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={!isConfigValid || isSaving} className="flex-1">
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configuração
          </Button>
          {hasConfig && (
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          )}
        </div>

        <Separator />

        {/* Test Section */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Testar Conexão</h4>

          <div className="space-y-2">
            <Label htmlFor="testTicketId">Número do Chamado (opcional)</Label>
            <Input
              id="testTicketId"
              placeholder="Ex: 1234"
              value={testTicketId}
              onChange={(e) => setTestTicketId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Informe um número de chamado para testar a busca completa
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
                Testar Conexão
              </>
            )}
          </Button>

          {/* Test Result */}
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
                {testResult.ticketData && (
                  <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                    <p><strong>ID:</strong> {testResult.ticketData.id}</p>
                    <p><strong>Título:</strong> {testResult.ticketData.name}</p>
                    <p><strong>Status:</strong> {testResult.ticketData.status}</p>
                    <p><strong>Prioridade:</strong> {testResult.ticketData.priority}</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
