import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { CustomDashboard } from "@/types/dashboard";

export function useCustomDashboards() {
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<CustomDashboard[]>("/api/custom-dashboards");
      setDashboards(data ?? []);
    } catch {
      setDashboards([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(async (dash: Partial<CustomDashboard>) => {
    const created = await api.post<CustomDashboard>("/api/custom-dashboards", dash);
    setDashboards((prev) => [...prev, created]);
    return created;
  }, []);

  const update = useCallback(async (id: number, fields: Partial<CustomDashboard>) => {
    const updated = await api.patch<CustomDashboard>(`/api/custom-dashboards/${id}`, fields);
    setDashboards((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, []);

  const remove = useCallback(async (id: number) => {
    await api.delete(`/api/custom-dashboards/${id}`);
    setDashboards((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const reorder = useCallback(async (order: number[]) => {
    await api.put("/api/custom-dashboards/reorder", { order });
    setDashboards((prev) => {
      const map = new Map(prev.map((d) => [d.id, d]));
      return order.map((id, i) => ({ ...map.get(id)!, position: i }));
    });
  }, []);

  return { dashboards, isLoading, load, create, update, remove, reorder };
}
