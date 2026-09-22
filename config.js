const SUPABASE_URL = "https://rfkqxiwbicjsszjbdhzd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BwBmKpfKD1sgcdu2JGZIww_zjX_ATsM";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const CONFIG = {
    instagram: "https://instagram.com/f1_studio",
    tiktok: "https://tiktok.com/@f1_studio",
    whatsappNumber: "",
    delivery: { pickup: 0, ganja: 3, region: 5 },
    giftWrap: 5
};

export { sb, CONFIG };
