# F1 Studio Modular V23

Production candidate for the F1 Studio frontend.

## Frontend
- `index.html`
- `css/styles.css`
- `js/` modular application code and Supabase services
- `vercel.json` security headers

## Supabase
The `supabase/` folder contains only the two production SQL steps:

1. `apply-create-order-hardening.sql` — changes `create_order()` and adds DB-side order abuse protection.
2. `verify-production.sql` — read-only production gate.

Run the apply script only after normal database backup/review. Then run the verify script.

No CAPTCHA/Turnstile is included.
Do not place a Supabase service-role/secret key in frontend files.
