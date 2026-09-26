import type { WorkspaceRole } from './workspace';
export const STAFF_READ_ROLES=['owner','admin','manager','service_advisor','technician','dispatcher','receptionist','fleet_manager','viewer'] as const satisfies readonly WorkspaceRole[];
export const STAFF_WRITE_ROLES=['owner','admin','manager','service_advisor','dispatcher','receptionist'] as const satisfies readonly WorkspaceRole[];
export const SERVICE_CATALOG_WRITE_ROLES=['owner','admin','manager','service_advisor'] as const satisfies readonly WorkspaceRole[];
