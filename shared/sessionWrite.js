// Eski sekme koruması: aynı oturum iki sekmede açıkken eski kopya, diskteki daha yeni kaydı ezmesin.
// Her kayıt, sekmenin devam ettiği sürümü (base = o sürümün updatedAt'i) taşır; disk bundan yeniyse araya başka sekme yazmıştır.

/**
 * true: yazılmamalı (disk, sekmenin bildiği sürümden yeni).
 * base yoksa (eski istemci) ya da diskte updatedAt yoksa denetim yapılmaz.
 * @param {{ updatedAt?: number } | null} stored
 * @param {number | null | undefined} base
 */
export function isStaleWrite(stored, base) {
  return Number.isFinite(stored?.updatedAt) && Number.isFinite(base) && stored.updatedAt > base;
}
