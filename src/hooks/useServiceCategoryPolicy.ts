/**
 * useServiceCategoryPolicy — resolves the vehicle-selector / fluid-spec policy
 * for a set of selected service categories.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchServiceCategoryPolicies } from "@/application/queries/service-category-policy.query";
import {
  resolveCategoryPolicy,
  DEFAULT_CATEGORY_POLICY,
  type ResolvedCategoryPolicy,
} from "@/lib/service-category-policy";

export function useServiceCategoryPolicy(
  categoryKeys: Array<string | null | undefined>,
): ResolvedCategoryPolicy {
  const { data: rows } = useQuery({
    queryKey: ["service-category-policies"],
    queryFn: fetchServiceCategoryPolicies,
    staleTime: 10 * 60 * 1000,
  });

  const key = categoryKeys.filter(Boolean).join("|");

  return useMemo(() => {
    if (!rows) return DEFAULT_CATEGORY_POLICY;
    return resolveCategoryPolicy(rows, key ? key.split("|") : []);

  }, [rows, key]);
}
