-- F1 Studio: harden pending order inventory handling.
-- PREVIEW STAGING ONLY. DO NOT RUN ON PRODUCTION UNTIL APPROVED.
-- Based on the live schema inspected on 2026-11-20.
-- Existing orders already debited stock under the old logic; preserve that history.
-- This does NOT solve fake-order database spam by itself; gateway CAPTCHA/rate limits are separate.
-- Preflight: back up the database and rehearse on an isolated Supabase branch.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.orders
  add column if not exists stock_deducted_at timestamptz;

-- Old create_order deducted inventory immediately, including pending orders.
-- Do not double-debit these existing, non-cancelled orders on later confirmation.
-- Existing cancelled orders with no restored timestamp may require manual reconciliation.
update public.orders
set stock_deducted_at = created_at
where stock_deducted_at is null
  and status <> 'cancelled'
  and stock_restored_at is null;

-- Centralise stock accounting in a DB trigger so both direct admin table updates
-- and the admin_set_order_status RPC have the SAME business rules.
create or replace function private.reconcile_order_stock_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trigger$
declare
  line record;
  current_qty integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status in ('cancelled','completed') then
    raise exception 'ORDER_STATUS_TERMINAL';
  end if;

  -- Do not accept client-supplied accounting timestamps on status changes.
  new.stock_deducted_at := old.stock_deducted_at;
  new.stock_restored_at := old.stock_restored_at;

  if new.status not in ('pending_confirmation','cancelled')
     and old.stock_deducted_at is null then
    for line in
      select oi.product_id, sum(oi.qty)::integer as qty
      from public.order_items as oi
      where oi.order_id = old.id and oi.product_id is not null
      group by oi.product_id
      order by oi.product_id
    loop
      select p.stock_quantity into current_qty
      from public.products as p
      where p.id = line.product_id
      for update;
      if not found then
        raise exception 'PRODUCT_NOT_FOUND';
      end if;
      if current_qty is not null then
        if current_qty < line.qty then
          raise exception 'OUT_OF_STOCK';
        end if;
        update public.products
        set stock_quantity = stock_quantity - line.qty,
            updated_at = clock_timestamp()
        where id = line.product_id;
      end if;
    end loop;
    new.stock_deducted_at := clock_timestamp();
  end if;

  if new.status = 'cancelled'
     and old.stock_deducted_at is not null
     and old.stock_restored_at is null then
    for line in
      select oi.product_id, sum(oi.qty)::integer as qty
      from public.order_items as oi
      where oi.order_id = old.id and oi.product_id is not null
      group by oi.product_id
      order by oi.product_id
    loop
      update public.products
      set stock_quantity = stock_quantity + line.qty,
          updated_at = clock_timestamp()
      where id = line.product_id and stock_quantity is not null;
    end loop;
    new.stock_restored_at := clock_timestamp();
  end if;

  return new;
end;
$trigger$;

revoke all on function private.reconcile_order_stock_on_status()
from public, anon, authenticated;

drop trigger if exists trg_reconcile_order_stock_on_status on public.orders;
create trigger trg_reconcile_order_stock_on_status
before update of status on public.orders
for each row execute function private.reconcile_order_stock_on_status();

-- Existing admin RPC had a second, independent cancellation-restock loop.
-- Replace it with a single status write; the trigger performs stock accounting.
create or replace function public.admin_set_order_status(
  p_order_id bigint,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.orders%rowtype;
  next_status text := lower(trim(coalesce(p_status,'')));
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_order_id is null or p_order_id <= 0
     or next_status not in
       ('pending_confirmation','confirmed','preparing','ready','shipped','completed','cancelled') then
    raise exception 'INVALID_ORDER';
  end if;

  select * into target from public.orders
  where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if target.status <> next_status then
    update public.orders
    set status = next_status
    where id = target.id
    returning * into target;
  end if;

  return jsonb_build_object(
    'id', target.id,
    'status', target.status,
    'stock_restored', target.stock_restored_at is not null
  );
end;
$function$;

-- Keep other order validations, RLS and per-client rate limiting unchanged.
-- Only remove the automatic inventory deduction from new pending orders.
CREATE OR REPLACE FUNCTION public.create_order(p_items jsonb, p_customer_name text, p_customer_phone text, p_customer_email text DEFAULT ''::text, p_delivery text DEFAULT 'pickup'::text, p_address text DEFAULT ''::text, p_address_unknown boolean DEFAULT false, p_gift_wrap boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    uid uuid := (SELECT auth.uid());
    item jsonb;
    p public.products%ROWTYPE;
    qty integer;
    product_id bigint;
    subtotal numeric(10,2) := 0;
    delivery_fee numeric(10,2) := 0;
    wrap_fee numeric(10,2) := 0;
    total_value numeric(10,2);
    new_order public.orders%ROWTYPE;
    new_code text;
    delivery_pickup numeric(10,2) := 0;
    delivery_ganja numeric(10,2) := 3;
    delivery_region numeric(10,2) := 5;
    gift_wrap_price numeric(10,2) := 5;
    caller_profile public.profiles%ROWTYPE;
BEGIN
    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0
       OR jsonb_array_length(p_items) > 50 THEN
      RAISE EXCEPTION 'INVALID_ORDER';
    END IF;

    IF length(trim(COALESCE(p_customer_name,''))) < 2
       OR length(trim(p_customer_name)) > 120 THEN
      RAISE EXCEPTION 'INVALID_ORDER';
    END IF;

    IF length(regexp_replace(COALESCE(p_customer_phone,''), E'\\D', '', 'g')) NOT BETWEEN 9 AND 15 THEN
      RAISE EXCEPTION 'INVALID_ORDER';
    END IF;

    IF length(COALESCE(p_customer_email,'')) > 320 THEN
      RAISE EXCEPTION 'INVALID_ORDER';
    END IF;

    IF length(COALESCE(p_address,'')) > 500 THEN
      RAISE EXCEPTION 'INVALID_ORDER';
    END IF;

    IF p_delivery NOT IN ('pickup','ganja','region') THEN
      RAISE EXCEPTION 'INVALID_ORDER';
    END IF;

    IF p_delivery <> 'pickup'
       AND COALESCE(p_address_unknown,false) = false
       AND length(trim(COALESCE(p_address,''))) = 0 THEN
      RAISE EXCEPTION 'ADDRESS_REQUIRED';
    END IF;

    -- Rate-limit order creation attempts server-side. Logged-in customers are
    -- keyed by auth.uid(); guests use the first proxy client IP available.
    DECLARE
      request_headers jsonb;
      client_identity text;
      rate_key text;
      current_attempts integer;
    BEGIN
      BEGIN
        request_headers := COALESCE(
          NULLIF(current_setting('request.headers', true), '')::jsonb,
          '{}'::jsonb
        );
      EXCEPTION WHEN OTHERS THEN
        request_headers := '{}'::jsonb;
      END;

      client_identity := CASE
        WHEN uid IS NOT NULL THEN
          'uid:' || uid::text
        ELSE
          'ip:' || split_part(
            COALESCE(
              request_headers->>'x-forwarded-for',
              request_headers->>'x-real-ip',
              request_headers->>'cf-connecting-ip',
              'unknown'
            ),
            ',',
            1
          )
      END;

      IF length(client_identity) > 256 OR client_identity = 'ip:' THEN
        client_identity := 'unknown';
      END IF;

      rate_key := md5('f1-order-rate-v1|' || client_identity);

      INSERT INTO public.order_rate_limits(
        rate_key, window_started_at, attempt_count, updated_at
      )
      VALUES (
        rate_key, clock_timestamp(), 1, clock_timestamp()
      )
      ON CONFLICT (rate_key) DO UPDATE
      SET
        attempt_count = CASE
          WHEN public.order_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
            THEN 1
          ELSE public.order_rate_limits.attempt_count + 1
        END,
        window_started_at = CASE
          WHEN public.order_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
            THEN clock_timestamp()
          ELSE public.order_rate_limits.window_started_at
        END,
        updated_at = clock_timestamp()
      RETURNING attempt_count
      INTO current_attempts;

      IF current_attempts > 8 THEN
        RAISE EXCEPTION 'ORDER_RATE_LIMITED';
      END IF;
    END;

    SELECT
      COALESCE(s.delivery_pickup,0),
      COALESCE(s.delivery_ganja,3),
      COALESCE(s.delivery_region,5),
      COALESCE(s.gift_wrap,5)
    INTO delivery_pickup, delivery_ganja, delivery_region, gift_wrap_price
    FROM public.site_settings AS s
    WHERE s.id = 1;

    IF p_delivery = 'ganja' THEN
      delivery_fee := delivery_ganja;
    ELSIF p_delivery = 'region' THEN
      delivery_fee := delivery_region;
    ELSE
      delivery_fee := delivery_pickup;
    END IF;

    -- Validate every submitted line first. Stock is checked later per UNIQUE
    -- product, so the same product appearing on multiple customization lines
    -- cannot bypass the stock check.
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      IF jsonb_typeof(item) <> 'object'
         OR COALESCE(item->>'productId','') !~ '^[0-9]+$'
         OR COALESCE(item->>'qty','') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'INVALID_ORDER';
      END IF;

      qty := (item->>'qty')::integer;
      IF qty < 1 OR qty > 100 THEN
        RAISE EXCEPTION 'INVALID_ORDER';
      END IF;

      IF item ? 'customization'
         AND jsonb_typeof(item->'customization') NOT IN ('object','null') THEN
        RAISE EXCEPTION 'INVALID_ORDER';
      END IF;

      IF item ? 'customization' AND pg_column_size(item->'customization') > 32768 THEN
        RAISE EXCEPTION 'INVALID_ORDER';
      END IF;

      IF item ? 'customization'
         AND jsonb_typeof(item->'customization') = 'object'
         AND COALESCE(item->'customization'->>'imagePath','') <> '' THEN
        IF uid IS NULL
           OR (item->'customization'->>'imagePath') !~ (
                '^orders/' || uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|pdf)$'
              ) THEN
          RAISE EXCEPTION 'INVALID_DESIGN_PATH';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM storage.objects AS so
          WHERE so.bucket_id = 'customer-designs'
            AND so.name = (item->'customization'->>'imagePath')
            AND so.owner_id = uid::text
        ) THEN
          RAISE EXCEPTION 'DESIGN_FILE_NOT_FOUND';
        END IF;
      END IF;
    END LOOP;

    -- Reject blocked authenticated customers before taking product locks.
    IF uid IS NOT NULL THEN
      SELECT * INTO caller_profile
      FROM public.profiles
      WHERE id = uid;

      IF caller_profile.blocked = true THEN
        RAISE EXCEPTION 'ACCOUNT_BLOCKED';
      END IF;
    END IF;

    -- Lock and validate each UNIQUE product once. This is the important fix:
    -- multiple order lines for the same product are aggregated before the stock
    -- check and before the stock decrement.
    FOR product_id IN
      SELECT DISTINCT (item->>'productId')::bigint
      FROM jsonb_array_elements(p_items) AS item
      ORDER BY 1
    LOOP
      SELECT * INTO p
      FROM public.products
      WHERE id = product_id
      FOR UPDATE;

      IF NOT FOUND OR COALESCE(p.is_active, true) = false THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
      END IF;

      IF p.price IS NULL OR p.price < 0 THEN
        RAISE EXCEPTION 'INVALID_PRODUCT';
      END IF;

      SELECT COALESCE(SUM((item->>'qty')::integer), 0)::integer
      INTO qty
      FROM jsonb_array_elements(p_items) AS item
      WHERE (item->>'productId')::bigint = product_id;

      IF p.stock_quantity IS NOT NULL AND p.stock_quantity < qty THEN
        RAISE EXCEPTION 'OUT_OF_STOCK';
      END IF;

      subtotal := subtotal + (p.price * qty);
    END LOOP;

    IF COALESCE(p_gift_wrap,false) THEN
      wrap_fee := gift_wrap_price;
    END IF;

    total_value := subtotal + delivery_fee + wrap_fee;

    new_code := 'F1-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,10));

    INSERT INTO public.orders (
      order_code, user_id, customer_name, customer_phone, customer_email,
      delivery, address, address_unknown, gift_wrap, total, status
    ) VALUES (
      new_code,
      uid,
      trim(p_customer_name),
      trim(p_customer_phone),
      trim(COALESCE(p_customer_email,'')),
      p_delivery,
      CASE WHEN COALESCE(p_address_unknown,false) THEN '' ELSE trim(COALESCE(p_address,'')) END,
      COALESCE(p_address_unknown,false),
      COALESCE(p_gift_wrap,false),
      total_value,
      'pending_confirmation'
    ) RETURNING * INTO new_order;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      product_id := (item->>'productId')::bigint;
      qty := (item->>'qty')::integer;

      SELECT * INTO p
      FROM public.products
      WHERE id = product_id;

      INSERT INTO public.order_items(
        order_id, product_id, product_name, price, qty, customization
      ) VALUES (
        new_order.id,
        p.id,
        p.name,
        p.price,
        qty,
        CASE WHEN item ? 'customization' THEN item->'customization' ELSE NULL END
      );
    END LOOP;
    -- Stock is not debited for unverified pending orders.
    -- Confirmation/cancellation is handled atomically by the status trigger below.

    RETURN jsonb_build_object('order', to_jsonb(new_order));
END;
$function$

-- Admins must not be able to fake the stock-restored marker through the Data API.
revoke update (stock_restored_at) on public.orders from authenticated;

commit;
