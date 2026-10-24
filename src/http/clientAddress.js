const MAX_ADDRESS_LENGTH = 64;

// The address used to rate limit a visitor. Behind a trusted proxy (such as
// Vercel) every connection comes from the proxy, so the visitor's address is
// taken from the X-Forwarded-For header that the proxy sets. That header is only
// believed when the settings say a trusted proxy is in front of the server,
// because anyone can send it to a server that is reached directly.
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const [first] = String(req.headers['x-forwarded-for'] ?? '').split(',');
    const forwarded = first.trim().slice(0, MAX_ADDRESS_LENGTH);
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
