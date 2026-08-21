export type SourceFileType = "csv" | "xlsx" | "paste";

export type BatchStatus =
  | "draft"
  | "parsed"
  | "mapped"
  | "decoded"
  | "review"
  | "committed"
  | "failed";

export type VehicleImportRowStatus =
  | "pending"
  | "valid"
  | "needs_review"
  | "blocked"
  | "imported"
  | "failed";

export type DuplicateStatus =
  | "none"
  | "exact_match"
  | "likely_duplicate"
  | "conflict"
  | "new_record";

export type DecodeStatus =
  | "not_started"
  | "pending"
  | "success"
  | "partial"
  | "failed"
  | "invalid_vin";

export type ValidationSeverity = "info" | "warning" | "error";

export type VehicleProfileInput = {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  series?: string;
  bodyStyle?: string;
  bodyClass?: string;
  vehicleType?: string;
  engine?: string;
  engineCylinders?: number;
  displacementLiters?: number;
  fuelTypePrimary?: string;
  fuelTypeSecondary?: string;
  drivetrain?: string;
  transmission?: string;
  gvwrClass?: string;
  manufacturer?: string;
  plantCountry?: string;
  plantCity?: string;
  plate?: string;
  unitNumber?: string;
  odometer?: number;
  odometerUnit?: "mi" | "km";
  color?: string;
  clientId?: string;
  customerId?: string;
  fleetId?: string;
  locationId?: string;
  contractId?: string;
  serviceProfile?: string;
  status?: "active" | "inactive" | "do_not_service";
  notes?: string;
  oilSpec?: string;
  oilCapacity?: number;
  oilFilterPartNumber?: string;
  tags?: string[];
  /** Newest completed service date derived from YES/NO history columns. */
  lastServiceDate?: string;
  /** Human-readable service history captured from the source sheet. */
  serviceHistoryNote?: string;
};

/** Filter/oil fitment resolved for a row after VIN decode. */
export type RowSpecResolution = {
  status: "resolved" | "partial" | "no_match" | "skipped";
  filters: Array<{
    partCategory: string;
    partNumber: string;
    brand: string;
    quantity: number;
    source: string;
  }>;
  missingCategories: string[];
  oilResetMethod?: string | null;
  note: string | null;
};

/** Client, location, and job intent applied to every row in a batch. */
export type ImportJobSetup = {
  fleetClientId: string | null;
  fleetClientName: string | null;
  fleetLocationId: string | null;
  fleetContractId: string | null;
  serviceRuleId: string | null;
  servicePackageCode: string | null;
  servicePackageLabel: string | null;
  servicePackagePrice: number;
  servicePackageDurationMinutes: number;
  servicePackageIncludes: string[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  technicianId: string | null;
  poNumber: string | null;
  billingMethod: string | null;
  notes: string | null;
};

export type VehicleImportBatch = {
  id: string;
  sourceFileName: string;
  sourceFileType: SourceFileType;
  totalRows: number;
  parsedRows: number;
  readyRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  committedRows: number;
  status: BatchStatus;
  createdAt: string;
  createdBy: string;
  mapping: FieldMapping[];
  headers: string[];
  /** Client name suggested by the sheet title, when the list had no client column. */
  sheetTitle?: string | null;
  /** Non-tabular lines below the roster (e.g. "ALL RAMS ARE V6/3.6 LITER"). */
  footnotes?: string[];
  droppedRows?: number;
  jobSetup?: ImportJobSetup | null;
};

export type VehicleImportRow = {
  id: string;
  batchId: string;
  rowIndex: number;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  mappedPayload: Partial<VehicleProfileInput>;
  decodedPayload?: Partial<VehicleProfileInput>;
  validationStatus: VehicleImportRowStatus;
  validationMessages: {
    field?: string;
    severity: ValidationSeverity;
    code: string;
    message: string;
  }[];
  duplicateStatus: DuplicateStatus;
  decodeStatus: DecodeStatus;
  existingVehicleId?: string;
  resolutionPayload?: Partial<VehicleProfileInput>;
  previousValidationStatus?: VehicleImportRowStatus;
  specPayload?: RowSpecResolution;
  commitStatus: "pending" | "committed" | "failed" | "skipped";
};

export type FieldMapping = {
  sourceHeader: string;
  targetField: keyof VehicleProfileInput | "ignore";
  confidence: number;
  required: boolean;
};

export type ExistingVehicleCandidate = {
  id: string;
  vin?: string | null;
  license_plate?: string | null;
  unit_number?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  fleet_client_id?: string | null;
};

export type ImportStep = "landing" | "setup" | "mapping" | "processing" | "review" | "results" | "work_orders";

export type ImportSummary = {
  importedSuccessfully: number;
  skipped: number;
  duplicatesFound: number;
  failedValidation: number;
  warningsAccepted: number;
};

export type ImportProcessingProgress = {
  parsedRows: number;
  decodedRows: number;
  validatedRows: number;
  duplicateCheckedRows: number;
  specResolvedRows: number;
  totalRows: number;
};

export type VehicleImportSession = {
  batch: VehicleImportBatch;
  rows: VehicleImportRow[];
};
