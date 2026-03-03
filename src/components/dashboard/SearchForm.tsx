import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { GLPIGroupResponse } from "@/types/glpi";

interface SearchFormProps {
  groups: GLPIGroupResponse[];
  isLoadingGroups: boolean;
  selectedGroup: string;
  onGroupChange: (value: string) => void;
  dateFrom: Date | undefined;
  onDateFromChange: (date: Date | undefined) => void;
  dateTo: Date | undefined;
  onDateToChange: (date: Date | undefined) => void;
  isSearching: boolean;
  onSearch: () => void;
}

export function SearchForm({
  groups,
  isLoadingGroups,
  selectedGroup,
  onGroupChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  isSearching,
  onSearch,
}: SearchFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dash-group">Grupo Técnico</Label>
        <Select value={selectedGroup} onValueChange={onGroupChange} disabled={isLoadingGroups}>
          <SelectTrigger id="dash-group">
            <SelectValue placeholder={isLoadingGroups ? "Carregando..." : "Selecione um grupo"} />
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>De</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={onDateFromChange} locale={ptBR} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label>Até</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={onDateToChange} locale={ptBR} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button onClick={onSearch} disabled={isSearching} className="w-full">
        {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
        Buscar
      </Button>
    </div>
  );
}
