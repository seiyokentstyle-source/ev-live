import { getLiveIndex } from "@/lib/live-data";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(await getLiveIndex());
}
