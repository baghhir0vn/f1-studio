# F1 Studio V71 — Production Readiness Build

Bu qovluq Vercel/static hosting üçün təmiz production build-dir. V71-də ZIP-in kökündə `index.html` birbaşa yerləşir.

## Daxildir
- `index.html`
- `css/`
- `js/`
- `assets/`
- `vercel.json`

## V71 dəyişiklikləri
- Sayt Ayarlarında hədiyyə qablaşdırması qiymətinin `site_settings` cədvəlinə `true/false` kimi deyil, rəqəm məbləğ kimi saxlanılması düzəldildi.
- Release arxivi `v61/` əlavə qovluğu olmadan birbaşa deploy kökü ilə paketlənir.

## Production yoxlama siyahısı

### 1. Vercel
- ZIP-i açın və layihənin kök qovluğu kimi bu qovluğu deploy edin.
- `index.html` kökdə qalmalıdır.
- `vercel.json` silinməməlidir; security və cache header-ləri oradadır.

### 2. Supabase
Sayt məhsul, auth, sifariş, rəylər, Design Studio faylları və sayt ayarları üçün Supabase istifadə edir. Production Supabase layihəsində tətbiqin SQL/migration addımları və RLS/storage siyasətləri ayrıca tətbiq olunmalıdır.

Minimum yoxlanmalı cədvəl və xidmətlər:
- `products`
- `orders` / `order_items`
- `profiles`
- `reviews`
- `site_settings`
- müştəri dizayn faylları üçün Storage bucket və siyasətlər

### 3. WhatsApp sifarişi
- Admin paneldə **Sayt Ayarları → WhatsApp nömrəsi** sahəsini doldurun.
- Nömrə beynəlxalq formatda olmalıdır; sifariş zamanı sayt onu rəqəmlərə normalizasiya edib `wa.me` keçidi yaradır.
- `site_settings` sətri mövcud deyilsə, checkout WhatsApp nömrəsi konfiqurasiya edilmədiyi üçün sifarişi WhatsApp-a ötürməyəcək.

### 4. Çatdırılma və hədiyyə qablaşdırması
- Pickup, Gəncə daxili, rayon/poçt və hədiyyə qablaşdırması qiymətlərini Sayt Ayarlarından yoxlayın.
- Hədiyyə qablaşdırmasının qiyməti rəqəm kimi saxlanılır və checkout hesablamasında həmin məbləğ istifadə olunur.

### 5. Sosial şəbəkə və ünvan
- Instagram, TikTok, ünvan və iş saatlarını Sayt Ayarlarından yoxlayın.
- Google Maps iframe və xəritə keçidi üçün domenə çıxışın bloklanmadığını yoxlayın.

### 6. Release qeydi
Bu build-ə development/audit skriptləri, lokal Windows start faylları və Supabase migration faylları daxil edilmir.


## GitHub upload
Bu paket qəsdən flat hazırlanıb: ZIP-i açdıqdan sonra içindəki bütün faylları repository-nin root qovluğuna yüklə. index.html, styles.css, app.js və şəkillər root-da qalmalıdır.
