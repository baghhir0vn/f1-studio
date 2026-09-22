-- F1 Studio production hardening for create_order().
-- Run only after reviewing the function and taking your normal DB backup.
-- This migration preserves guest checkout while adding duplicate-line stock protection
-- and a lightweight DB-side success-order rate limit. It is transactional.

begin;

create schema if not exists private;

create table if not exists private.order_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  constraint order_rate_limits_count_chk check (request_count >= 0)
);

revoke all on table private.order_rate_limits from public, anon, authenticated;

create or replace function public.create_order(
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default ''::text,
  p_delivery text default 'pickup'::text,
  p_address text default ''::text,
  p_address_unknown boolean default false,
  p_gift_wrap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  item jsonb;
  p public.products%rowtype;
  qty integer;
  product_id bigint;
  total_qty_for_product integer;
  subtotal numeric(10,2) := 0;
  delivery_fee numeric(10,2) := 0;
  wrap_fee numeric(10,2) := 0;
  total_value numeric(10,2);
  new_order public.orders%rowtype;
  new_code text;
  delivery_pickup numeric(10,2) := 0;
  delivery_ganja numeric(10,2) := 3;
  delivery_region numeric(10,2) := 5;
  gift_wrap_price numeric(10,2) := 5;
  caller_profile public.profiles%rowtype;
  request_headers jsonb;
  client_ip text;
  rate_key text;
  rate_limit integer;
  rate_window_started_at timestamptz;
  rate_count integer;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_ORDER';
  end if;

  if length(trim(coalesce(p_customer_name,''))) < 2
     or length(trim(p_customer_name)) > 120 then
    raise exception 'INVALID_ORDER';
  end if;

  if length(regexp_replace(coalesce(p_customer_phone,''), E'\\D', '', 'g')) not between 9 and 15 then
    raise exception 'INVALID_ORDER';
  end if;

  if length(coalesce(p_customer_email,'')) > 320 then
    raise exception 'INVALID_ORDER';
  end if;

  if length(coalesce(p_address,'')) > 500 then
    raise exception 'INVALID_ORDER';
  end if;

  if p_delivery is null or p_delivery not in ('pickup','ganja','region') then
    raise exception 'INVALID_ORDER';
  end if;

  if p_delivery <> 'pickup'
     and coalesce(p_address_unknown,false) = false
     and length(trim(coalesce(p_address,''))) = 0 then
    raise exception 'ADDRESS_REQUIRED';
  end if;

  select
    coalesce(s.delivery_pickup,0),
    coalesce(s.delivery_ganja,3),
    coalesce(s.delivery_region,5),
    coalesce(s.gift_wrap,5)
  into delivery_pickup, delivery_ganja, delivery_region, gift_wrap_price
  from public.site_settings as s
  where s.id = 1;

  if p_delivery = 'ganja' then
    delivery_fee := delivery_ganja;
  elsif p_delivery = 'region' then
    delivery_fee := delivery_region;
  else
    delivery_fee := delivery_pickup;
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(item->>'productId','') !~ '^[0-9]+$'
       or coalesce(item->>'qty','') !~ '^[0-9]+$' then
      raise exception 'INVALID_ORDER';
    end if;

    product_id := (item->>'productId')::bigint;
    qty := (item->>'qty')::integer;

    if qty < 1 or qty > 100 then
      raise exception 'INVALID_ORDER';
    end if;

    select * into p
    from public.products
    where id = product_id
    for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;

    select coalesce(sum((x->>'qty')::integer), 0)
    into total_qty_for_product
    from jsonb_array_elements(p_items) as x
    where x->>'productId' = product_id::text;

    if total_qty_for_product > 100 then
      raise exception 'INVALID_ORDER';
    end if;

    if p.stock_quantity is not null and p.stock_quantity < total_qty_for_product then
      raise exception 'OUT_OF_STOCK';
    end if;

    if item ? 'customization' and pg_column_size(item->'customization') > 32768 then
      raise exception 'INVALID_ORDER';
    end if;

    subtotal := subtotal + (p.price * qty);
  end loop;

  if coalesce(p_gift_wrap,false) then
    wrap_fee := gift_wrap_price;
  end if;

  total_value := subtotal + delivery_fee + wrap_fee;

  if uid is not null then
    select * into caller_profile
    from public.profiles
    where id = uid;

    if caller_profile.blocked = true then
      raise exception 'ACCOUNT_BLOCKED';
    end if;
  end if;

  if coalesce(caller_profile.role, '') <> 'admin' then
    if uid is null then
      request_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
      client_ip := nullif(trim(split_part(coalesce(request_headers->>'x-forwarded-for',''), ',', 1)), '');
      if client_ip is not null then
        rate_key := 'ip:' || md5(client_ip);
        rate_limit := 5;
      end if;
    else
      rate_key := 'uid:' || uid::text;
      rate_limit := 20;
    end if;

    if rate_key is not null then
      insert into private.order_rate_limits(rate_key, window_started_at, request_count)
      values (rate_key, clock_timestamp(), 1)
      on conflict (rate_key) do update
      set
        window_started_at = case
          when private.order_rate_limits.window_started_at < clock_timestamp() - interval '10 minutes'
            then clock_timestamp()
          else private.order_rate_limits.window_started_at
        end,
        request_count = case
          when private.order_rate_limits.window_started_at < clock_timestamp() - interval '10 minutes'
            then 1
          else private.order_rate_limits.request_count + 1
        end
      returning window_started_at, request_count
      into rate_window_started_at, rate_count;

      if rate_count > rate_limit then
        raise exception 'ORDER_RATE_LIMITED';
      end if;
    end if;
  end if;

  new_code := 'F1-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,10));

  insert into public.orders (
    order_code, user_id, customer_name, customer_phone, customer_email,
    delivery, address, address_unknown, gift_wrap, total, status
  ) values (
    new_code,
    uid,
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(coalesce(p_customer_email,'')),
    p_delivery,
    case when coalesce(p_address_unknown,false) then '' else trim(coalesce(p_address,'')) end,
    coalesce(p_address_unknown,false),
    coalesce(p_gift_wrap,false),
    total_value,
    'pending_confirmation'
  ) returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    product_id := (item->>'productId')::bigint;
    qty := (item->>'qty')::integer;

    select * into p
    from public.products
    where id = product_id
    for update;

    insert into public.order_items(
      order_id, product_id, product_name, price, qty, customization
    ) values (
      new_order.id,
      p.id,
      p.name,
      p.price,
      qty,
      case when item ? 'customization' then item->'customization' else null end
    );
  end loop;

  for product_id, total_qty_for_product in
    select (x->>'productId')::bigint, sum((x->>'qty')::integer)::integer
    from jsonb_array_elements(p_items) as x
    group by (x->>'productId')::bigint
  loop
    if (select stock_quantity from public.products where id = product_id) is not null then
      update public.products
      set stock_quantity = stock_quantity - total_qty_for_product,
          updated_at = clock_timestamp()
      where id = product_id;
    end if;
  end loop;

  return jsonb_build_object('order', to_jsonb(new_order));
end;
$function$;

revoke execute on function public.create_order(jsonb,text,text,text,text,text,boolean,boolean) from public;
grant execute on function public.create_order(jsonb,text,text,text,text,text,boolean,boolean) to anon, authenticated, service_role;

commit;
