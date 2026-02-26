export async function GET() {
  return Response.json({
    ok: true,
    service: "fotofacil",
    now: new Date().toISOString()
  });
}
