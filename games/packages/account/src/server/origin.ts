/**
 * Only pages of this site may call the APIs: the Origin must be this host,
 * or — for a same-origin GET, which carries no Origin — the browser must say
 * the request came from this site. In development the page (Vite) and the
 * Worker run on different local ports, so any local origin is fine there.
 */
export function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return request.headers.get("Sec-Fetch-Site") === "same-origin";
  let from: URL;
  try {
    from = new URL(origin);
  } catch {
    return false;
  }
  if (from.host === url.host) return true;
  const local = (host: string): boolean => host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
  return local(url.hostname) && local(from.hostname);
}
