import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserTrackHandler } from "./handler.js";

/** Adapts the fetch handler to Node's `http` request/response pair (Express, Fastify raw, plain `createServer`). */
export function toNodeHandler(handler: UserTrackHandler) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(", "));
    const host = req.headers.host ?? "localhost";
    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? "http";
    const method = req.method ?? "POST";
    const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks).toString("utf8");
    let response: Response;
    try {
      response = await handler(new Request(`${proto}://${host}${req.url ?? "/"}`, { method, headers, ...(body !== undefined ? { body } : {}) }));
    } catch {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code: "USERTRACK_SOURCE_ERROR", message: "handler failed" }));
      return;
    }
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  };
}
