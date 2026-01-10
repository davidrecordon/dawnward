export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    runtime: "nodejs",
    timestamp: new Date().toISOString(),
    message: "Next.js API route is working",
  });
}
