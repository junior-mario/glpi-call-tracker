import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface Contact {
  id: number;
  name: string;
  phone: string;
}

export function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    api.get<Contact[]>("/api/whatsapp-contacts").then(setContacts);
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !phone.trim()) {
      toast({ title: "Preencha nome e telefone", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      const newContact = await api.post<Contact>("/api/whatsapp-contacts", { name: name.trim(), phone: phone.trim() });
      setContacts((prev) => [...prev, newContact].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setPhone("");
      toast({ title: "Contato adicionado" });
    } catch {
      toast({ title: "Erro ao adicionar contato", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setEditName(contact.name);
    setEditPhone(contact.phone);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
  };

  const handleEdit = async (id: number) => {
    if (!editName.trim() || !editPhone.trim()) {
      toast({ title: "Preencha nome e telefone", variant: "destructive" });
      return;
    }
    try {
      const updated = await api.patch<Contact>(`/api/whatsapp-contacts/${id}`, { name: editName.trim(), phone: editPhone.trim() });
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEdit();
      toast({ title: "Contato atualizado" });
    } catch {
      toast({ title: "Erro ao atualizar contato", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/whatsapp-contacts/${id}`);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Contato removido" });
    } catch {
      toast({ title: "Erro ao remover contato", variant: "destructive" });
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Phone className="h-5 w-5 text-primary" />
          Agenda WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="contact-name">Nome</Label>
            <Input
              id="contact-name"
              placeholder="Nome do contato"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="contact-phone">Telefone</Label>
            <Input
              id="contact-phone"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={isAdding} size="sm" className="shrink-0">
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {/* Contact list */}
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum contato cadastrado
          </p>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center gap-2 p-2 rounded-md border">
                {editingId === contact.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 h-8"
                    />
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="flex-1 h-8"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(contact.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{contact.name}</span>
                    <span className="flex-1 text-sm text-muted-foreground">{contact.phone}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(contact)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(contact.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
