import { useState, useEffect, useCallback } from "react";
import { fetchServiceDependenciesData } from "@/application/queries/service-dependencies.query";

interface ServiceDependency {
  service_id: string;
  depends_on_service_id: string;
  dependency_type: string;
  auto_add: boolean | null;
  required: boolean | null;
}

interface ServiceTemplate {
  id: string;
  name: string;
  default_price: number | null;
}

interface DependencyResult {
  autoAddServices: ServiceTemplate[];
  requiredDependencies: Map<string, string[]>; // service_id -> depends_on_service_ids
  canRemove: (serviceId: string, selectedServices: string[]) => { allowed: boolean; reason?: string };
}

export const useServiceDependencies = () => {
  const [dependencies, setDependencies] = useState<ServiceDependency[]>([]);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDependencies = async () => {
      const [depsRes, templatesRes] = await fetchServiceDependenciesData();

      if (depsRes.data) setDependencies(depsRes.data);
      if (templatesRes.data) setTemplates(templatesRes.data);
      setLoading(false);
    };

    fetchDependencies();
  }, []);

  // Get auto-add services for a given service (by template_id)
  const getAutoAddServices = useCallback(
    (templateId: string): ServiceTemplate[] => {
      const deps = dependencies.filter(
        (d) => d.service_id === templateId && d.auto_add === true
      );
      return deps
        .map((d) => templates.find((t) => t.id === d.depends_on_service_id))
        .filter((t): t is ServiceTemplate => t !== undefined);
    },
    [dependencies, templates]
  );

  // Check if a service can be removed (not required by another selected service)
  const canRemoveService = useCallback(
    (
      templateIdToRemove: string,
      selectedTemplateIds: string[]
    ): { allowed: boolean; reason?: string; dependentServices?: string[] } => {
      // Find services that require this one
      const dependentDeps = dependencies.filter(
        (d) =>
          d.depends_on_service_id === templateIdToRemove &&
          d.required === true &&
          selectedTemplateIds.includes(d.service_id)
      );

      if (dependentDeps.length > 0) {
        const dependentNames = dependentDeps
          .map((d) => templates.find((t) => t.id === d.service_id)?.name)
          .filter(Boolean);
        return {
          allowed: false,
          reason: `This service is required by: ${dependentNames.join(", ")}`,
          dependentServices: dependentDeps.map((d) => d.service_id),
        };
      }

      return { allowed: true };
    },
    [dependencies, templates]
  );

  // Get all required dependencies for a service
  const getRequiredDependencies = useCallback(
    (templateId: string): ServiceTemplate[] => {
      const deps = dependencies.filter(
        (d) => d.service_id === templateId && d.required === true
      );
      return deps
        .map((d) => templates.find((t) => t.id === d.depends_on_service_id))
        .filter((t): t is ServiceTemplate => t !== undefined);
    },
    [dependencies, templates]
  );

  // Process service selection - returns services to add and any that should be auto-added
  const processServiceSelection = useCallback(
    (
      templateId: string,
      currentSelectedTemplateIds: string[]
    ): { toAdd: string[]; autoAdded: ServiceTemplate[] } => {
      const toAdd = [templateId];
      const autoAdded: ServiceTemplate[] = [];

      // Get auto-add dependencies
      const autoAddServices = getAutoAddServices(templateId);
      for (const service of autoAddServices) {
        if (!currentSelectedTemplateIds.includes(service.id) && !toAdd.includes(service.id)) {
          toAdd.push(service.id);
          autoAdded.push(service);
        }
      }

      return { toAdd, autoAdded };
    },
    [getAutoAddServices]
  );

  return {
    loading,
    dependencies,
    templates,
    getAutoAddServices,
    canRemoveService,
    getRequiredDependencies,
    processServiceSelection,
  };
};
