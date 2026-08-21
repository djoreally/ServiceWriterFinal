# CARFAX Integration Guide

## Overview

This document outlines the complete CARFAX integration requirements for the Service Writer platform. The integration consists of three main components:

1. **QuickVIN™ Plus** - License plate to VIN lookup
2. **Service History Check™** - Vehicle service history retrieval  
3. **Car Care Data Feed** - Daily service record submission to CARFAX

---

## 1. QuickVIN™ Plus Integration

### Purpose
Allows service providers to enter a vehicle license plate and state to automatically populate the VIN, make, model, and year.

### API Endpoint
```
POST https://quickvin.carfax.com/1
```

### Request Format (XML)
```xml
<carfax-request>
  <license-plate><![CDATA[ABC1234]]></license-plate>
  <state><![CDATA[VA]]></state>
  <vin><![CDATA[]]></vin>
  <product-data-id>YOUR_PRODUCT_DATA_ID</product-data-id>
  <location-id>YOUR_LOCATION_ID</location-id>
</carfax-request>
```

### Request Parameters
| Parameter | Length | Description |
|-----------|--------|-------------|
| PlateNumber | 1-10 chars, alphanumeric | License plate number |
| StateCode | 2 chars, alpha | US state or Canadian province code |
| VIN | 17 chars, alpha | Optional - for VIN decode when plate lookup fails |
| product-data-id | 16 chars | CARFAX-provided unique ID |
| location-id | 1-50 chars | Partner-assigned shop location code |

### Response Format (XML)
Success response includes:
- VIN
- Year
- Make  
- Model
- Submodel/Trim
- ACES details (optional)
- OEM decode data (optional)

### Error Codes
| Code | Description |
|------|-------------|
| 100 | Invalid request format |
| 102 | License plate > 10 characters |
| 105 | Invalid state code |
| 107 | Invalid VIN format |
| 115 | Invalid VIN for plate/state |
| 201 | Missing Location ID |
| 302 | Invalid credentials |

---

## 2. Service History Check™ Integration

### Purpose
Retrieves a vehicle's complete service history from CARFAX, enabling shops to identify unperformed maintenance.

### API Endpoint
```
POST https://servicesocket.carfax.com/data/1
```

### Request Format (JSON)
```json
{
  "vin": "1HGEJ824XYL123456",
  "productDataId": "YOUR_PRODUCT_DATA_ID",
  "locationId": "YOUR_LOCATION_ID"
}
```

### Request Parameters
| Parameter | Length | Description |
|-----------|--------|-------------|
| vin | 17 chars | Vehicle Identification Number |
| productDataId | 16 chars, case-sensitive | CARFAX-provided ID |
| locationId | 1-50 chars | Partner location identifier |

### Response Structure
```json
{
  "carfaxRequest": {
    "requestTime": 1426693206554,
    "vin": "1HGEJ824XYL123456",
    "productDataId": "...",
    "locationId": "..."
  },
  "serviceHistory": {
    "vin": "1HGEJ824XYL123456",
    "make": "HONDA",
    "model": "CIVIC EX",
    "year": "2020",
    "bodyTypeDescription": "4 Door Sedan",
    "engineInformation": "1.5L I4 Turbo",
    "driveline": "Front wheel drive",
    "serviceCategories": [
      {
        "serviceName": "Oil change/Engine oil filter",
        "dateOfLastService": "06/10/2023",
        "odometerOfLastService": "45,601"
      }
    ],
    "displayRecords": [
      {
        "displayDate": "06/10/2023",
        "odometer": "45,601",
        "text": "Oil and filter changed",
        "recordType": "service"
      }
    ]
  }
}
```

### Service Categories Tracked
- Oil change/Engine oil filter
- Tire Rotation
- Cabin air filter replacement
- Air filter replacement
- Radiator Antifreeze Flush
- Transmission fluid exchange
- Brake linings/pads replacement
- Emissions Test
- Battery Replacement
- And more...

---

## 3. Car Care Data Feed Specification

### Purpose
Submit daily service records to CARFAX for inclusion in vehicle history reports.

### File Format Requirements
- **Format**: Flat text file (.TXT)
- **Delimiter**: Pipe (|)
- **Field enclosure**: Double quotes ("field_value")
- **Structure**: One service event per line (multi-line for multi-service ROs)

### File Types
1. **HIST** - Historical archive (initial setup, all past records)
2. **PROD** - Production (daily updates, closed invoices from that day)

### File Naming Convention
```
PartnerName_DataStatus_DataType_FileExportDate.txt
```
Examples:
- `SW_PROD_RO_12182024.txt`
- `SW_HIST_RO_12182024.txt`

### Required Data Fields

| Field Name | Description | Data Type | Format |
|------------|-------------|-----------|--------|
| VIN | Vehicle ID Number | Text | 17 alphanumeric chars |
| RO_OPEN_DATE | Date RO was opened | Date | MM/DD/YYYY |
| RO_CLOSE_DATE | Date RO was closed | Date | MM/DD/YYYY |
| MILEAGE | Odometer reading | Number | Rounded to nearest mile |
| ODOMETER_MEASURE | Unit of measurement | Text | "MI" or "KM" |
| RO_INVOICE_NUMBER | Invoice/RO number | Text | Customer defined |
| SERVICE_DESCRIPTION | Service performed | Text | Description |
| LABOR_DESCRIPTION | Labor description | Text | Description |
| PART_NAME_DESCRIPTION | Part name/description | Text | Description |
| PART_QUANTITY | Quantity of parts | Number | Integer |
| MAKE | Vehicle make | Text | e.g., "HONDA" |
| MODEL | Vehicle model | Text | e.g., "CIVIC" |
| MODEL_YEAR | Vehicle year | Number | 4 digits |
| PLATE | License plate | Text | Plate number |
| PLATE_STATE | State abbreviation | Text | 2 chars |
| MANAGEMENT_SYSTEM | Software platform ID | Text | Unique identifier |
| LOCATION_ID | Location identifier | Text | Unique per location |
| LOCATION_NAME | Business name | Text | Shop name |
| ADDRESS | Street address | Text | Street address |
| CITY | City | Text | City name |
| STATE | State abbreviation | Text | 2 chars |
| POSTAL_CODE | ZIP code | Text | ZIP/Postal code |
| PHONE | Phone number | Text | xxx-xxx-xxxx |
| URL | Website URL | Text | Optional |

### Sample Data File
```
"VIN"|"RO_OPEN_DATE"|"RO_CLOSE_DATE"|"MILEAGE"|"ODOMETER_MEASURE"|"RO_INVOICE_NUMBER"|"SERVICE_DESCRIPTION"|"LABOR_DESCRIPTION"|"PART_NAME_DESCRIPTION"|"PART_QUANTITY"|"MAKE"|"MODEL"|"MODEL_YEAR"|"PLATE"|"PLATE_STATE"|"MANAGEMENT_SYSTEM"|"LOCATION_ID"|"LOCATION_NAME"|"ADDRESS"|"CITY"|"STATE"|"POSTAL_CODE"|"PHONE"|"URL"
"1HGEJ824XYL123456"|"12/18/2024"|"12/18/2024"|"45601"|"MI"|"SR-2024-001"|"OIL & FILTER CHANGE"|"CHANGE ENGINE OIL"|"5W30 SYNTHETIC OIL"|"5"|"HONDA"|"CIVIC"|"2020"|"ABC1234"|"VA"|"SERVICE_WRITER"|"SW001"|"Example Auto Shop"|"123 Main St"|"Springfield"|"VA"|"22150"|"555-123-4567"|"https://example.com"
```

### File Transfer
- **Method**: FTP
- **Server**: data.carfax.com
- **Credentials**: Provided by CARFAX during onboarding
- **Frequency**: Daily (nightly preferred)

### Important Notes
- Only include COMPLETED services (exclude declined services)
- Only include valid 17-character VINs
- Multi-service repair orders should have one line per service
- Empty fields should be represented as ""

---

## 4. Location Setup Requirements

### Location Activation Request (Authorization Tool)
```
POST https://quickvin.carfax.com/authorizer/1/
```

### Required Location Information
```xml
<carfax-request>
  <partner>
    <management-system>Service Writer</management-system>
    <product-data-id>TOBEPROVIDED</product-data-id>
    <comp-code>TOBEPROVIDED</comp-code>
  </partner>
  <location>
    <location-id>SW001</location-id>
    <name>Example Auto Shop</name>
    <address>123 Main St</address>
    <city>Springfield</city>
    <state>VA</state>
    <zip>22150</zip>
    <phone>5551234567</phone>
    <url>https://example.com</url>
    <business-contact>John Smith</business-contact>
    <technical-contact>Tech Support</technical-contact>
    <email>support@example.com</email>
  </location>
</carfax-request>
```

### Location ID Requirements
- Must be UNIQUE across all reporting facilities
- Recommended format: `SW` + unique number (e.g., `SW001`, `SW002`)
- Can include software license number or store phone number

---

## 5. Implementation Milestones

1. ☐ CARFAX provides documentation (complete)
2. ☐ Intro call with CARFAX Partner Development Manager
3. ☐ Partner provides sample file to CARFAX for review
4. ☐ CARFAX approves file format
5. ☐ CARFAX provides FTP credentials
6. ☐ Send initial archive (HIST) file
7. ☐ Begin production (PROD) daily feeds

---

## 6. Contact Information

**Data Services Questions:**
- Email: DataServicesmycarfaxserviceshop@carfax.com

**Partner Development:**
- Email: CarfaxCarCarePartnerDevelopment@carfax.com

**Data Reporting Support:**
- Email: Servicenetworksupport@carfax.com
- Phone: 888-655-5362

---

## Appendix A: US State Codes

| State | Code | State | Code |
|-------|------|-------|------|
| Alabama | AL | Montana | MT |
| Alaska | AK | Nebraska | NE |
| Arizona | AZ | Nevada | NV |
| Arkansas | AR | New Hampshire | NH |
| California | CA | New Jersey | NJ |
| Colorado | CO | New Mexico | NM |
| Connecticut | CT | New York | NY |
| Delaware | DE | North Carolina | NC |
| Florida | FL | North Dakota | ND |
| Georgia | GA | Ohio | OH |
| Hawaii | HI | Oklahoma | OK |
| Idaho | ID | Oregon | OR |
| Illinois | IL | Pennsylvania | PA |
| Indiana | IN | Rhode Island | RI |
| Iowa | IA | South Carolina | SC |
| Kansas | KS | South Dakota | SD |
| Kentucky | KY | Tennessee | TN |
| Louisiana | LA | Texas | TX |
| Maine | ME | Utah | UT |
| Maryland | MD | Vermont | VT |
| Massachusetts | MA | Virginia | VA |
| Michigan | MI | Washington | WA |
| Minnesota | MN | West Virginia | WV |
| Mississippi | MS | Wisconsin | WI |
| Missouri | MO | Wyoming | WY |

## Appendix B: Canadian Province Codes

| Province | Code |
|----------|------|
| Alberta | AB |
| British Columbia | BC |
| Manitoba | MB |
| New Brunswick | NB |
| Newfoundland and Labrador | NL |
| Nova Scotia | NS |
| Ontario | ON |
| Prince Edward Island | PE |
| Quebec | QC |
| Saskatchewan | SK |
