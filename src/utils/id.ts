/**
 * Tạo ID duy nhất an toàn trên mọi trình duyệt và mọi giao thức (kể cả HTTP qua mạng LAN trên điện thoại,
 * nơi crypto.randomUUID() bị trình duyệt ẩn đi do không phải Secure Context).
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
