import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

interface AddTicketFormProps {
  onAddTicket: (ticketId: string) => void;
  isLoading: boolean;
}

export function AddTicketForm({ onAddTicket, isLoading }: AddTicketFormProps) {
  const [ticketId, setTicketId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketId.trim()) {
      onAddTicket(ticketId.trim());
      setTicketId("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Digite o número do chamado..."
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
          className="pl-10 h-11"
          disabled={isLoading}
        />
      </div>
      <Button type="submit" disabled={!ticketId.trim() || isLoading} className="h-11 px-6">
        <Plus className="h-4 w-4 mr-2" />
        {isLoading ? "Buscando..." : "Adicionar"}
      </Button>
    </form>
  );
}
