/**
 * URLs embedded in QR codes for the public claim flow.
 * Set VITE_PUBLIC_APP_URL in production so scans open your real host (not localhost).
 */

export function getAppPublicBase() {
  const fromEnv = (import.meta.env.VITE_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * @param {string} base - e.g. https://app.example.com
 * @param {{ token: string }} p
 */
export function buildClaimUrl(base, { token }) {
  const root = (base || "").replace(/\/$/, "");
  if (!root) return "";
  const params = new URLSearchParams({
    t: String(token),
  });
  return `${root}/claim?${params.toString()}`;
}

/** @param {URLSearchParams} searchParams */
export function parseClaimQuery(searchParams) {
  const token = (searchParams.get("t") || "").trim();
  return { token };
}

export function isValidClaimQuery({ token }) {
  return token.length > 0;
}
