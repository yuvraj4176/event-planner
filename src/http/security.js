// Headers applied to every response. The content security policy allows only
// same-origin scripts and styles: there is no inline code and no third-party
// origin, so injected markup cannot execute or call out.
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

// HSTS is only meaningful, and only sent, when the connection is encrypted.
export function applySecurityHeaders(res, req) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  if (req?.socket?.encrypted) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
