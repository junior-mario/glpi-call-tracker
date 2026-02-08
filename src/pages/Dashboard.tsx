import { LayoutDashboard } from "lucide-react";

const Dashboard = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <LayoutDashboard className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">Dashboard</h2>
      <p className="text-muted-foreground max-w-md">
        Em breve. Esta página exibirá um painel com métricas e visão geral dos seus chamados.
      </p>
    </div>
  );
};

export default Dashboard;
