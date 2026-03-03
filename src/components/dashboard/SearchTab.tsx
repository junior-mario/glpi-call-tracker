import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import { GLPIGroupResponse } from "@/types/glpi";
import { fetchGLPIGroups } from "@/services/glpiService";
import { toast } from "@/hooks/use-toast";
import { SearchForm } from "./SearchForm";
import { SearchCharts } from "./SearchCharts";
import { useDashboardSearch } from "./useDashboardSearch";

export function SearchTab() {
  const [groups, setGroups] = useState<GLPIGroupResponse[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);

  const search = useDashboardSearch();

  useEffect(() => {
    setIsLoadingGroups(true);
    fetchGLPIGroups()
      .then(setGroups)
      .catch((err) => {
        toast({
          title: "Erro ao carregar grupos",
          description: err instanceof Error ? err.message : "Erro desconhecido",
          variant: "destructive",
        });
      })
      .finally(() => setIsLoadingGroups(false));
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Pesquisa avançada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SearchForm
            groups={groups}
            isLoadingGroups={isLoadingGroups}
            selectedGroup={search.selectedGroup}
            onGroupChange={search.setSelectedGroup}
            dateFrom={search.dateFrom}
            onDateFromChange={search.setDateFrom}
            dateTo={search.dateTo}
            onDateToChange={search.setDateTo}
            isSearching={search.isSearching}
            onSearch={() => search.handleSearch()}
          />
        </CardContent>
      </Card>

      {search.isSearching && (
        <Card>
          <CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando...
          </CardContent>
        </Card>
      )}

      {!search.isSearching && search.hasSearched && search.tickets.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Nenhum chamado encontrado.
          </CardContent>
        </Card>
      )}

      {!search.isSearching && search.tickets.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {search.tickets.length} chamado{search.tickets.length !== 1 ? "s" : ""} encontrado
            {search.tickets.length !== 1 ? "s" : ""}
          </p>
          <SearchCharts
            kpis={search.kpis}
            statusData={search.statusData}
            statusChartConfig={search.statusChartConfig}
            priorityData={search.priorityData}
            priorityChartConfig={search.priorityChartConfig}
            techData={search.techData}
            techChartConfig={search.techChartConfig}
            tagData={search.tagData}
            tagChartConfig={search.tagChartConfig}
            dailyData={search.dailyData}
            dailyChartConfig={search.dailyChartConfig}
          />
        </>
      )}
    </div>
  );
}
