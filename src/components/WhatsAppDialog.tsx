import { useState, useEffect } from "react";
import { Ticket } from "@/types/ticket";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { differenceInDays } from "date-fns";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface WhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
}

function generateMessage(tickets: Ticket[]): string {
  const lines = tickets.map((t) => {
    const days = differenceInDays(new Date(), new Date(t.updatedAt));
    const idle = days === 0 ? "atualizado hoje" : days === 1 ? "1 dia sem interação" : `${days} dias sem interação`;
    return `• #${t.id} - ${t.title} (${idle})`;
  });

  return `Olá! Gostaria de um retorno sobre os seguintes chamados:\n\n${lines.join("\n")}\n\nAgradeço a atenção!`;
}

export function WhatsAppDialog({ open, onOpenChange, tickets }: WhatsAppDialogProps) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open && tickets.length > 0) {
      setMessage(generateMessage(tickets));
    }
  }, [open, tickets]);

  const handleSend = async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) {
      toast({ title: "Informe o número de telefone", variant: "destructive" });
      return;
    }
    if (!message.trim()) {
      toast({ title: "A mensagem não pode estar vazia", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      await api.post("/api/whatsapp/send", { to: cleaned, body: message });
      toast({ title: "Mensagem enviada com sucesso!" });
      onOpenChange(false);
      setPhone("");
    } catch (err) {
      toast({
        title: "Erro ao enviar mensagem",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cobrar via WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp-phone">Telefone (com DDD e código do país)</Label>
            <Input
              id="whatsapp-phone"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp-message">
              Mensagem ({tickets.length} chamado{tickets.length !== 1 ? "s" : ""})
            </Label>
            <Textarea
              id="whatsapp-message"
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isSending} className="bg-green-600 hover:bg-green-700">
            {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
