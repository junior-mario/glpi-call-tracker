import { ConfigPanel } from "@/components/ConfigPanel";
import { ContactsPanel } from "@/components/ContactsPanel";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const handleConfigSaved = () => {
    toast({
      title: "Configuração salva",
      description: "As configurações da API GLPI foram salvas com sucesso.",
    });
  };

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <ConfigPanel onConfigSaved={handleConfigSaved} />
      <ContactsPanel />
    </div>
  );
};

export default Settings;
