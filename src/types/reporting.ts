export interface DimensionSchema {
  city: string;
  postal_code: string;
  state: string;
  make: string;
  model: string;
  year: number | string;
  fuel_type: string;
  oil_type: string;
  oil_capacity: string | number;
  scheduled_time_slot: string;
  client_type: string;
  status: string;
  technician_name: string;
  van_name: string;
}

export interface MeasureSchema {
  total_billed: number;
  net_collected: number;
  balance_due: number;
  quarts_used: number;
  job_count: number;
  duration_minutes: number;
}

export interface FilterClause {
  field: keyof DimensionSchema | keyof MeasureSchema;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'between';
  value: any;
}

export interface DynamicReportConfig {
  id?: string;
  name: string;
  rows: Array<keyof DimensionSchema>;       // Group by Rows
  columns: Array<keyof DimensionSchema>;    // Group by Columns
  values: Array<{
    field: keyof MeasureSchema;
    aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  }>;
  filters: FilterClause[];
  timeRange: { from: Date | string; to: Date | string };
  chartType: 'heatmap' | 'pivot' | 'geo' | 'chart';
}

export interface CohortTemplate {
  id: string;
  name: string;
  description: string;
  filters: FilterClause[];
}
