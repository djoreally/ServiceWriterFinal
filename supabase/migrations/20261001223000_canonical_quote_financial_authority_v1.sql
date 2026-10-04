-- Canonical quote financial authority.
-- Quote lines own price. Header subtotal/total are projections of persisted lines.

create or replace function public.canonicalize_quote_item_total_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.quantity := greatest(coalesce(new.quantity,0),0);
  new.unit_price := greatest(coalesce(new.unit_price,0),0);
  new.total_price := public.money_round_v1(new.quantity * new.unit_price,2);
  return new;
end;
$$;

create or replace function public.sync_quote_totals_v1(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_subtotal numeric := 0;
  v_tax numeric := 0;
begin
  select public.money_round_v1(coalesce(sum(qi.total_price),0),2)
  into v_subtotal
  from public.quote_items qi
  where qi.quote_id=p_quote_id;

  select public.money_round_v1(greatest(coalesce(q.tax_total,0),0),2)
  into v_tax
  from public.quotes q
  where q.id=p_quote_id;

  update public.quotes
  set subtotal=v_subtotal,
      total=public.money_round_v1(v_subtotal+coalesce(v_tax,0),2),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'financial_authority','quote_items_v1'
      ),
      updated_at=pg_catalog.now()
  where id=p_quote_id
    and (
      public.money_round_v1(coalesce(subtotal,0),2)<>v_subtotal
      or public.money_round_v1(coalesce(total,0),2)<>public.money_round_v1(v_subtotal+coalesce(v_tax,0),2)
      or coalesce(metadata->>'financial_authority','')<>'quote_items_v1'
    );
end;
$$;

create or replace function public.quote_items_sync_totals_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.sync_quote_totals_v1(coalesce(new.quote_id,old.quote_id));
  if tg_op='UPDATE' and new.quote_id is distinct from old.quote_id then
    perform public.sync_quote_totals_v1(old.quote_id);
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function public.quotes_enforce_line_totals_trigger_v1()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_has_lines boolean;
  v_subtotal numeric;
begin
  select exists(
    select 1 from public.quote_items qi where qi.quote_id=new.id
  ), public.money_round_v1(coalesce(sum(qi.total_price),0),2)
  into v_has_lines,v_subtotal
  from public.quote_items qi
  where qi.quote_id=new.id;

  if v_has_lines then
    new.subtotal := v_subtotal;
  else
    -- A quote without lines has no commercial subtotal. The first line insert
    -- will project its price into the header.
    new.subtotal := 0;
  end if;
  new.tax_total := public.money_round_v1(greatest(coalesce(new.tax_total,0),0),2);
  new.total := public.money_round_v1(new.subtotal+new.tax_total,2);
  new.metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
    'financial_authority','quote_items_v1'
  );
  return new;
end;
$$;

drop trigger if exists quote_items_canonical_total_v1 on public.quote_items;
create trigger quote_items_canonical_total_v1
before insert or update of quantity,unit_price,total_price
on public.quote_items
for each row execute function public.canonicalize_quote_item_total_v1();

drop trigger if exists quote_items_sync_quote_totals_v1 on public.quote_items;
create trigger quote_items_sync_quote_totals_v1
after insert or update or delete
on public.quote_items
for each row execute function public.quote_items_sync_totals_trigger_v1();

drop trigger if exists quotes_enforce_line_totals_v1 on public.quotes;
create trigger quotes_enforce_line_totals_v1
before insert or update of subtotal,tax_total,total
on public.quotes
for each row execute function public.quotes_enforce_line_totals_trigger_v1();

-- Normalize all existing line totals from their persisted quantity/unit price,
-- then project headers from those lines. No catalog repricing occurs.
update public.quote_items
set total_price=public.money_round_v1(quantity*unit_price,2)
where total_price is distinct from public.money_round_v1(quantity*unit_price,2);

do $$
declare r record;
begin
  for r in select id from public.quotes loop
    perform public.sync_quote_totals_v1(r.id);
  end loop;
end;
$$;
