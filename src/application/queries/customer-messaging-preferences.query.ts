const LEGACY_TENANT_ID_QUERY_PARAM = "tenant_id" as const;

export function getMessagingPreferenceWorkspaceOwnerUserId(params: URLSearchParams): string {
  return params.get("user_id") || params.get(LEGACY_TENANT_ID_QUERY_PARAM) || "";
}
