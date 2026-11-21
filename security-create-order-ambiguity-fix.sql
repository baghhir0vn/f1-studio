-- F1 Studio: fix two verified PL/pgSQL name ambiguities in create_order.
-- Tested against isolated Supabase project dlwjkcqoclvlsyjmrjec, no production writes.
-- Apply BEFORE security-order-gateway-preview.sql in a coordinated release.
-- Does not change prices, inventory semantics, or RLS.
-- Source: current production pg_get_functiondef, with only:
--   (1) ON CONFLICT (rate_key) => ON CONFLICT ON CONSTRAINT order_rate_limits_pkey
--   (2) ambiguous JSON alias item => order_line in aggregate queries.
begin;
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
      ON CONFLICT ON CONSTRAINT order_rate_limits_pkey DO UPDATE
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
      SELECT DISTINCT (order_line->>'productId')::bigint
      FROM jsonb_array_elements(p_items) AS order_line
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

      SELECT COALESCE(SUM((order_line->>'qty')::integer), 0)::integer
      INTO qty
      FROM jsonb_array_elements(p_items) AS order_line
      WHERE (order_line->>'productId')::bigint = product_id;

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

    -- Decrement numeric stock once per UNIQUE product using the same aggregate
    -- quantities used for validation. Product rows remain locked until commit.
    FOR product_id IN
      SELECT DISTINCT (order_line->>'productId')::bigint
      FROM jsonb_array_elements(p_items) AS order_line
      ORDER BY 1
    LOOP
      SELECT COALESCE(SUM((order_line->>'qty')::integer), 0)::integer
      INTO qty
      FROM jsonb_array_elements(p_items) AS order_line
      WHERE (order_line->>'productId')::bigint = product_id;

      UPDATE public.products
      SET stock_quantity = stock_quantity - qty,
          updated_at = clock_timestamp()
      WHERE id = product_id
        AND stock_quantity IS NOT NULL;
    END LOOP;

    RETURN jsonb_build_object('order', to_jsonb(new_order));
END;
$function$;
commit;
