import { getLiveMachine, getLiveMachineParams } from "@/lib/live-data";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return getLiveMachineParams();
}

export async function GET(_request: Request, context: { params: Promise<{ hall: string; id: string }> }) {
  const { hall, id } = await context.params;
  const match = /^([a-z0-9]{1,40})\.json$/.exec(id);
  if (!match) return Response.json({ error: "Not found" }, { status: 404 });
  const payload = await getLiveMachine(match[1], hall);
  return payload ? Response.json(payload) : Response.json({ error: "Not found" }, { status: 404 });
}
