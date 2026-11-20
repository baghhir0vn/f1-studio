const SUPABASE_URL = "https://dlwjkcqoclvlsyjmrjec.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Nz8cVam4KPjub1Su8ZiSYA_XhulciZv";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const CONFIG = {
    siteUrl: window.location.origin,
    turnstileSiteKey: "0x4AAAAAAFbyWLVOPCNWcSJj",
    instagram: "https://instagram.com/f1_studio",
    tiktok: "https://tiktok.com/@f1_studio",
    whatsappNumber: "",
    delivery: { pickup: 0, ganja: 3, region: 5 },
    giftWrap: 5
};
export { sb, CONFIG };
