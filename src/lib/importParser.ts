let xlsxPromise: Promise<typeof import('xlsx')> | null = null;

async function getXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx');
  }
  return xlsxPromise;
}

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface ParsedData {
  headers: string[];
  rows: ParsedRow[];
}

export async function parseImportFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const XLSX = await getXlsx();
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, { 
          defval: null,
          raw: false 
        });
        
        if (jsonData.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        
        // Extract headers from first row keys
        const headers = Object.keys(jsonData[0]);
        
        resolve({ headers, rows: jsonData });
      } catch (error) {
        reject(new Error('Failed to parse file. Please ensure it is a valid CSV or Excel file.'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Normalize header names for matching
export function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\s-]+/g, '');
}

// Field mapping configurations
export const customerFieldMappings: Record<string, string[]> = {
  name: ['name', 'customername', 'customer', 'fullname', 'full_name', 'clientname', 'client'],
  email: ['email', 'emailaddress', 'e-mail', 'mail'],
  phone: ['phone', 'phonenumber', 'telephone', 'tel', 'mobile', 'cell', 'cellphone'],
  address: ['address', 'streetaddress', 'street', 'location'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
};

export const vehicleFieldMappings: Record<string, string[]> = {
  make: ['make', 'manufacturer', 'brand', 'vehiclemake'],
  model: ['model', 'vehiclemodel'],
  year: ['year', 'modelyear', 'vehicleyear'],
  vin: ['vin', 'vehicleidentificationnumber', 'chassisnumber'],
  license_plate: ['licenseplate', 'plate', 'platenumber', 'registration', 'regnumber', 'licenseplatenumber'],
  color: ['color', 'colour', 'vehiclecolor'],
  mileage: ['mileage', 'odometer', 'km', 'miles'],
};

export const appointmentFieldMappings: Record<string, string[]> = {
  title: ['title', 'servicetype', 'service', 'appointment', 'description', 'work', 'servicename'],
  scheduled_date: ['date', 'scheduleddate', 'appointmentdate', 'servicedate'],
  scheduled_time: ['time', 'scheduledtime', 'appointmenttime', 'servicetime'],
  duration_minutes: ['duration', 'durationminutes', 'minutes', 'length'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  estimated_cost: ['cost', 'price', 'estimatedcost', 'amount', 'total', 'estimate'],
  status: ['status', 'appointmentstatus'],
};

export const serviceFieldMappings: Record<string, string[]> = {
  service_type: ['servicetype', 'service', 'type', 'work', 'servicename', 'title'],
  description: ['description', 'desc', 'details', 'notes'],
  service_date: ['date', 'servicedate', 'completeddate', 'donedate'],
  labor_cost: ['laborcost', 'labor', 'labourcharge', 'labourprice'],
  parts_cost: ['partscost', 'parts', 'partsprice'],
  total_cost: ['total', 'totalcost', 'cost', 'price', 'amount', 'grandtotal'],
  technician: ['technician', 'mechanic', 'tech', 'worker'],
  status: ['status', 'servicestatus'],
};

// Auto-map headers to fields
export function autoMapHeaders(
  headers: string[], 
  fieldMappings: Record<string, string[]>
): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    
    for (const [field, aliases] of Object.entries(fieldMappings)) {
      if (aliases.some(alias => normalized === alias || normalized.includes(alias))) {
        if (!mapping[field]) {
          mapping[field] = header;
        }
        break;
      }
    }
  }
  
  return mapping;
}

// Parse date from various formats
export async function parseDate(value: string | number | null): Promise<string | null> {
  if (!value) return null;
  
  const str = String(value).trim();
  const XLSX = await getXlsx();
  
  // Try parsing as Excel serial date number
  if (/^\d+$/.test(str) || /^\d+\.\d+$/.test(str)) {
    const excelDate = parseFloat(str);
    if (excelDate > 1000 && excelDate < 100000) {
      const date = XLSX.SSF.parse_date_code(excelDate);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
  }
  
  // Try various date formats
  const dateFormats = [
    /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})/, // MM-DD-YYYY
    /^(\d{2})\.(\d{2})\.(\d{4})/, // DD.MM.YYYY
  ];
  
  for (const format of dateFormats) {
    const match = str.match(format);
    if (match) {
      // Determine which is year, month, day based on format
      if (format === dateFormats[0]) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      } else if (format === dateFormats[1] || format === dateFormats[2]) {
        return `${match[3]}-${match[1]}-${match[2]}`;
      } else {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }
    }
  }
  
  // Try native Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
}

// Parse time from various formats
export function parseTime(value: string | number | null): string {
  if (!value) return '09:00';
  
  const str = String(value).trim();
  
  // HH:MM format
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  
  // Excel time (fraction of day)
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  
  return '09:00';
}

// Parse number from string
export function parseNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  
  return isNaN(num) ? null : num;
}
