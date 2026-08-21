export const VEHICLE_IMPORT_SAMPLE_TSV = `Vehicle VIN\tUnit #\tYear\tMake\tModel\tLicense Plate\tClient Name\tLocation\tContract\tService Profile\tMileage\tStatus\tNotes
1FTBR1X8XMKA12345\tSV-201\t2021\tFord\tTransit\t7ABC123\tMetro Utility\tPhoenix Depot\tMetro 24-Month\tClass A PM\t104553\tActive\tPM service due
W1Y40CHY0NT123456\tSP-77\t2022\tMercedes-Benz\tSprinter\t8XYZ009\tNorthwind Logistics\tDallas Hub\tNorthwind Premium\tDiesel Priority\t86321\tDo Not Service\tinactive until contract renews
\tCUT-14\t2020\tChevrolet\tExpress\t\tMetro Utility\t\t\t\t\tActive\tVIN pending from OEM`

export const IMPORT_TEMPLATE_HEADERS = [
  "VIN",
  "License Plate",
  "Unit Number",
  "Vehicle Number",
  "Fleet Number",
  "Year",
  "Make",
  "Model",
  "Trim",
  "Mileage",
  "Customer Name",
  "Fleet",
  "Department",
  "Location",
  "Contract",
  "Service Profile",
  "Status",
  "Service Notes",
  "Fuel Type",
  "Engine",
];
