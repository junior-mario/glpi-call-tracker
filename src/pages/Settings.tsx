import { ConfigPanel } from "@/components/ConfigPanel";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const handleConfigSaved = () => {
    toast({
      title: "Configuração salva",
      description: "As configurações da API GLPI foram salvas com sucesso.",
    });
  };

  return (
    <div className="container max-w-2xl py-6">
      <ConfigPanel onConfigSaved={handleConfigSaved} />
    </div>
  );
};

export default Settings;
