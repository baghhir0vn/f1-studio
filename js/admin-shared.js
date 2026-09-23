export const ADMIN_API = {
  products: "/api/admin/products",
  orders: "/api/admin/orders",
  reviews: "/api/admin/reviews",
  stats: "/api/admin/stats"
};
export const ADMIN_STATUS_LABELS = {
  pending_confirmation: "Təsdiq gözləyir",
  confirmed: "Təsdiqləndi",
  preparing: "Hazırlanır",
  ready: "Hazırdır",
  shipped: "Göndərildi",
  completed: "Tamamlandı",
  cancelled: "Ləğv edildi"
};
export function formatAdminCustomerDate(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("az-AZ"); } catch (_) { return String(value); }
}
