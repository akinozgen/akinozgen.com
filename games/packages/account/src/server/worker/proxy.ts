import { FIREBASE_PROJECT } from "../../config.ts";

const FIREBASE_HOST = `${FIREBASE_PROJECT}.firebaseapp.com`;

/**
 * Firebase's sign-in helper pages (/__/auth/*, and the /__/firebase/init.json
 * they read), served from this site by passing the request through to
 * Firebase's own host — not redirecting to it. Browsers that keep storage
 * apart by site (Safari, Firefox, Chrome since 115) then see one site
 * throughout a Google sign-in, which is what Firebase asks for when an app
 * isn't on Firebase Hosting (firebase.google.com/docs/auth/web/redirect-best-practices).
 * The site's own cookies stay here.
 */
export async function proxyFirebaseAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/__/auth/") && url.pathname !== "/__/firebase/init.json") {
    return new Response("not found", { status: 404 });
  }
  const headers = new Headers(request.headers);
  headers.delete("Cookie");
  headers.delete("Host");
  const upstream = await fetch(`https://${FIREBASE_HOST}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
  const response = new Response(upstream.body, upstream);
  response.headers.delete("Set-Cookie");
  return response;
}
