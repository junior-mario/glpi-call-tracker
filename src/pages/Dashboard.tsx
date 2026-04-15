import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { loadGLPIConfig } from "@/services/glpiService";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { SearchTab } from "@/components/dashboard/SearchTab";
import { CustomDashboardsTab } from "@/components/dashboard/CustomDashboardsTab";

import { TicketDetailSheet } from "@/components/dashboard/TicketDetailSheet";

const Dashboard = () => {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [sheetTicketId, setSheetTicketId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    loadGLPIConfig().then((config) => {
      setHasConfig(!!config);
      setConfigLoaded(true);
    });
  }, []);

  const handleTicketClick = (ticketId: string) => {
    setSheetTicketId(ticketId);
    setSheetOpen(true);
  };

  if (!configLoaded) {
    return (
      <div className="container max-w-6xl py-6">
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando configuração...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasConfig) {
    return (
      <div className="container max-w-6xl py-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Configure a API GLPI em <strong>Configurações</strong> para usar o
            dashboard.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-6 px-4 mx-auto max-w-[1552px]">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="search">Pesquisa</TabsTrigger>
          <TabsTrigger value="custom">Dashboards</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab onTicketClick={handleTicketClick} />
        </TabsContent>

        <TabsContent value="search">
          <SearchTab />
        </TabsContent>

        <TabsContent value="custom">
          <CustomDashboardsTab onTicketClick={handleTicketClick} />
        </TabsContent>
      </Tabs>

      <TicketDetailSheet
        ticketId={sheetTicketId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
};

export default Dashboard;
