import { openapi } from "@/lib/api/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(openapi(), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=3600" } });
}
