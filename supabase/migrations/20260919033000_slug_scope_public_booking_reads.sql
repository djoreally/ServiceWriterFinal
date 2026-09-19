-- Slug-scoped public booking reads; never expose/require workspace owner UUID.
create or replace function public.get_public_service_catalog_v3(p_booking_slug text)
returns table(id uuid,name text,description text,category text,category_id text,default_price numeric,estimated_duration integer,is_upsell boolean,
service_vertical text,service_intent text,pricing_mode text,booking_requirements text[],requires_tire_quantity boolean,requires_fitment_lookup boolean,
requires_inventory_selection boolean,allows_manual_fitment boolean,configuration_schema_version integer)
language sql stable security definer set search_path='' as $$
 select sc.id,sc.name,sc.description,sc.category,
 coalesce(nullif(sc.metadata->>'category_id',''),lower(regexp_replace(coalesce(sc.category,'service'),'[^a-zA-Z0-9]+','_','g'))),
 sc.labor_price,coalesce(sc.estimated_minutes,30),coalesce((sc.metadata->>'is_upsell')::boolean,false),
 coalesce(nullif(sc.metadata->>'service_vertical',''),'automotive'),coalesce(nullif(sc.metadata->>'service_intent',''),lower(regexp_replace(sc.name,'[^a-zA-Z0-9]+','_','g'))),
 coalesce(nullif(sc.metadata->>'pricing_mode',''),'fixed'),
 case when jsonb_typeof(sc.metadata->'booking_requirements')='array' then array(select jsonb_array_elements_text(sc.metadata->'booking_requirements')) else array[]::text[] end,
 coalesce((sc.metadata->>'requires_tire_quantity')::boolean,false),coalesce((sc.metadata->>'requires_fitment_lookup')::boolean,false),
 coalesce((sc.metadata->>'requires_inventory_selection')::boolean,false),coalesce((sc.metadata->>'allows_manual_fitment')::boolean,true),
 coalesce((sc.metadata->>'configuration_schema_version')::integer,1)
 from public.service_catalog sc join public.workspace_settings ws on ws.workspace_id=sc.workspace_id join public.workspaces w on w.id=sc.workspace_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled and sc.is_active
 order by coalesce((sc.metadata->>'sort_order')::integer,9999),sc.name
$$;
revoke all on function public.get_public_service_catalog_v3(text) from public,anon,authenticated;grant execute on function public.get_public_service_catalog_v3(text) to anon,authenticated,service_role;

create or replace function public.get_public_service_packages_v2(p_booking_slug text)
returns table(id uuid,name text,description text,package_price numeric,discount_type text,discount_value numeric,estimated_duration integer,services jsonb)
language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.description,p.package_price,p.discount_type,p.discount_value,p.estimated_duration,
 coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'description',sc.description,'default_price',sc.labor_price,'estimated_duration',sc.estimated_minutes,'quantity',pi.quantity,'override_price',pi.override_price) order by sc.name) filter(where pi.id is not null),'[]'::jsonb)
 from public.service_packages p join public.workspace_settings ws on ws.workspace_id=p.workspace_id join public.workspaces w on w.id=p.workspace_id
 left join public.service_package_items pi on pi.package_id=p.id left join public.service_catalog sc on sc.id=pi.service_catalog_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled and p.is_active group by p.id order by p.name
$$;
revoke all on function public.get_public_service_packages_v2(text) from public,anon,authenticated;grant execute on function public.get_public_service_packages_v2(text) to anon,authenticated,service_role;

create or replace function public.get_public_booked_slots_v2(p_booking_slug text,p_booking_date date)
returns table(scheduled_time time,duration_minutes integer) language sql stable security definer set search_path='' as $$
 select (a.starts_at at time zone w.timezone)::time,greatest(1,ceil(extract(epoch from(a.ends_at-a.starts_at))/60.0)::integer)
 from public.appointments a join public.workspaces w on w.id=a.workspace_id join public.workspace_settings ws on ws.workspace_id=w.id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled
 and (a.starts_at at time zone w.timezone)::date=p_booking_date and a.status::text not in('cancelled','no_show') order by a.starts_at
$$;
revoke all on function public.get_public_booked_slots_v2(text,date) from public,anon,authenticated;grant execute on function public.get_public_booked_slots_v2(text,date) to anon,authenticated,service_role;

create or replace function public.get_public_booking_settings_v2(p_booking_slug text)
returns table(waste_oil_fee_enabled boolean,waste_oil_fee numeric,shop_fee_enabled boolean,shop_fee_type text,shop_fee_value numeric,shop_fee_description text,
surcharge_enabled boolean,surcharge_type text,surcharge_value numeric,surcharge_description text,payment_provider text,payments_enabled boolean,
oil_price_per_quart numeric,weather_guard_enabled boolean,weather_guard_settings jsonb,day_hours jsonb,service_verticals text[])
language sql stable security definer set search_path='' as $$
 select ws.waste_oil_fee_enabled,ws.waste_oil_fee,ws.shop_fee_enabled,ws.shop_fee_type,ws.shop_fee_value,ws.shop_fee_description,
 ws.surcharge_enabled,ws.surcharge_type,ws.surcharge_value,ws.surcharge_description,ws.payment_provider,
 coalesce((ws.operational_settings->>'stripe_charges_enabled')::boolean,false) and nullif(ws.operational_settings->>'stripe_account_id','') is not null,
 ws.oil_price_per_quart,coalesce((ws.operational_settings->>'weather_guard_enabled')::boolean,false),ws.operational_settings->'weather_guard_settings',ws.day_hours,
 case when jsonb_typeof(ws.operational_settings->'service_verticals')='array' then array(select jsonb_array_elements_text(ws.operational_settings->'service_verticals')) else array[]::text[] end
 from public.workspace_settings ws join public.workspaces w on w.id=ws.workspace_id
 where lower(ws.booking_slug::text)=lower(trim(p_booking_slug)) and w.is_active and ws.booking_enabled
$$;
revoke all on function public.get_public_booking_settings_v2(text) from public,anon,authenticated;grant execute on function public.get_public_booking_settings_v2(text) to anon,authenticated,service_role;
