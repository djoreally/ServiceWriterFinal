/**
 * Legacy Fleet compatibility query surface.
 * Fleet is a separate product; Service Writer no longer reads Fleet domain tables.
 * These exports remain only until preserved Fleet routes are removed from the bundle.
 */
export type FleetWorkOrderStatus="draft"|"pending_review"|"scheduled"|"assigned"|"en_route"|"arrived"|"in_progress"|"completed"|"invoiced"|"paid";
export interface FleetDashboardStats{totalClients:number;totalVehicles:number;openWorkOrders:number;completedThisMonth:number;monthlyRevenue:number;overdueOrders:number;vehiclesDueThisWeek:number;pendingInvoiceTotal:number;openPOs:number;}
export interface FleetWorkOrderSummary{ id:string; status?:string|null; order_number?:string|null; [key:string]:any; }
export interface FleetDashboardData{stats:FleetDashboardStats;recentOrders:FleetWorkOrderSummary[];scheduledOrders:FleetWorkOrderSummary[];}
export interface FleetVanSummary{ id:string;name:string;vin:string|null;license_plate:string|null;make:string|null;model:string|null;year:number|null;status:string;is_active:boolean;assigned_technician_id:string|null;technician_name?:string|null;territory_count?:number;inventory_count?:number;[key:string]:any; }
export interface FleetTechnicianSummary{ id:string;name:string;[key:string]:any; }
export interface FleetClientSummary{ id:string;company_name?:string|null;[key:string]:any; }
export interface FleetVehicleListItem{ id:string;year?:number|null;make?:string|null;model?:string|null;[key:string]:any; }
export interface FleetVehiclePageOptions{ [key:string]:any; }
export interface FleetVehiclePageResult{ data:FleetVehicleListItem[];count:number;[key:string]:any; }
export interface FleetVehicleFormOptions{ clients:any[];locations:any[];contracts:any[];[key:string]:any; }
export interface FleetVehicleEligibility{ eligible:boolean;reasons?:string[];[key:string]:any; }
export interface FleetWorkOrderCreateOptions{ [key:string]:any; }
export interface FleetWorkOrderDetail{ id:string;[key:string]:any; }
export interface FleetWorkOrderLineItem{ id:string;[key:string]:any; }
export interface FleetActivityLog{ id:string;[key:string]:any; }
export interface FleetApproval{ id:string;[key:string]:any; }
export interface FleetWorkOrderDetailResult{ workOrder:FleetWorkOrderDetail|null;lineItems:FleetWorkOrderLineItem[];activity:FleetActivityLog[];approvals:FleetApproval[];[key:string]:any; }
export interface FleetLocationSummary{ id:string;name?:string|null;[key:string]:any; }
export interface FleetPurchaseOrderSummary{ id:string;[key:string]:any; }
export interface FleetContactSummary{ id:string;[key:string]:any; }
export interface FleetContractSummary{ id:string;[key:string]:any; }
export interface FleetInvoiceSummary{ id:string;[key:string]:any; }
export interface FleetReportStats{ [key:string]:any; }
export interface FleetTopVehicleSpend{ [key:string]:any; }
export interface FleetReportsOverviewResult{ stats:FleetReportStats;topVehicles:FleetTopVehicleSpend[];[key:string]:any; }
export interface FleetCheckInRecord{ id:string;[key:string]:any; }
export interface FleetTodayWorkOrdersResult{ workOrders:FleetWorkOrderSummary[];checkins:Record<string,FleetCheckInRecord[]>;[key:string]:any; }
export interface FleetDomainSeparationHealth{ healthy:boolean;legacyRuntimeEnabled:boolean;message:string;[key:string]:any; }
export interface FleetSchedulerWindow{ orders:FleetWorkOrderSummary[];[key:string]:any; }
export interface FleetWorkOrderPageResult{ data:FleetWorkOrderSummary[];count:number;[key:string]:any; }
const EMPTY_STATS:FleetDashboardStats={totalClients:0,totalVehicles:0,openWorkOrders:0,completedThisMonth:0,monthlyRevenue:0,overdueOrders:0,vehiclesDueThisWeek:0,pendingInvoiceTotal:0,openPOs:0};
export async function fetchFleetDashboardData(..._args:any[]):Promise<FleetDashboardData>{return{stats:EMPTY_STATS,recentOrders:[],scheduledOrders:[]};}
export async function fetchFleetWorkOrders(..._args:any[]):Promise<FleetWorkOrderSummary[]>{return[];}
export async function fetchFleetWorkOrdersPage(..._args:any[]):Promise<FleetWorkOrderPageResult>{return{data:[],count:0};}
export async function fetchFleetSchedulerWindow(..._args:any[]):Promise<FleetSchedulerWindow>{return{orders:[]};}
export function subscribeToFleetScheduler(..._args:any[]):()=>void{return()=>undefined;}
export function subscribeToFleetList(..._args:any[]):()=>void{return()=>undefined;}
export async function fetchFleetVansOverview(..._args:any[]):Promise<FleetVanSummary[]>{return[];}
export async function fetchFleetClients(..._args:any[]):Promise<FleetClientSummary[]>{return[];}
export async function fetchFleetVehiclesList(..._args:any[]):Promise<FleetVehicleListItem[]>{return[];}
export async function fetchFleetVehiclesPage(..._args:any[]):Promise<FleetVehiclePageResult>{return{data:[],count:0};}
export async function fetchFleetVehicleFormOptions(..._args:any[]):Promise<FleetVehicleFormOptions>{return{clients:[],locations:[],contracts:[]};}
export async function fetchFleetWorkOrderCreateOptions(..._args:any[]):Promise<FleetWorkOrderCreateOptions>{return{};}
export async function fetchFleetVehicleEligibility(..._args:any[]):Promise<FleetVehicleEligibility>{return{eligible:false,reasons:["Fleet is managed in the Fleet application."]};}
export async function fetchFleetWorkOrderDetail(..._args:any[]):Promise<FleetWorkOrderDetailResult>{return{workOrder:null,lineItems:[],activity:[],approvals:[]};}
export async function fetchAssignableTechnicians(..._args:any[]):Promise<FleetTechnicianSummary[]>{return[];}
export async function fetchFleetDomainSeparationHealth(..._args:any[]):Promise<FleetDomainSeparationHealth>{return{healthy:true,legacyRuntimeEnabled:false,message:"Fleet runtime is separated from Service Writer."};}
export async function fetchFleetLocations(..._args:any[]):Promise<FleetLocationSummary[]>{return[];}
export async function fetchFleetPurchaseOrders(..._args:any[]):Promise<FleetPurchaseOrderSummary[]>{return[];}
export async function fetchFleetContacts(..._args:any[]):Promise<FleetContactSummary[]>{return[];}
export async function fetchFleetContracts(..._args:any[]):Promise<FleetContractSummary[]>{return[];}
export async function fetchFleetInvoices(..._args:any[]):Promise<FleetInvoiceSummary[]>{return[];}
export async function fetchFleetReportsOverview(..._args:any[]):Promise<FleetReportsOverviewResult>{return{stats:{},topVehicles:[]};}
export async function fetchFleetTodayWorkOrdersWithCheckins(..._args:any[]):Promise<FleetTodayWorkOrdersResult>{return{workOrders:[],checkins:{}};}
