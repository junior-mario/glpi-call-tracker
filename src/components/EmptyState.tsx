import { FileSearch } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <FileSearch className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Nenhum chamado adicionado
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Digite o número de um chamado GLPI no campo acima para começar a acompanhar suas atualizações.
      </p>
    </div>
  );
}
