import { useState, useEffect } from "react";
import { Ticket } from "@/types/ticket";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { differenceInDays } from "date-fns";

interface CopyMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
}

function generateMessage(tickets: Ticket[]): string {
  const lines = tickets.map((t) => {
    const days = differenceInDays(new Date(), new Date(t.updatedAt));
    const idle = days === 0 ? "atualizado hoje" : days === 1 ? "1 dia sem interação" : `${days} dias sem interação`;
    return `- #${t.id} — ${t.title} (${idle})`;
  });

  return `Prezado(a), bom dia!\n\nGostaria de solicitar uma atualização sobre o(s) seguinte(s) chamado(s):\n\n${lines.join("\n")}\n\nAguardo retorno. Obrigado!`;
}

export function CopyMessageDialog({ open, onOpenChange, tickets }: CopyMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && tickets.length > 0) {
      setMessage(generateMessage(tickets));
      setCopied(false);
    }
  }, [open, tickets]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = message;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Texto para cobrança</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Mensagem ({tickets.length} chamado{tickets.length !== 1 ? "s" : ""})
            </Label>
            <Textarea
              rows={12}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copiar texto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
