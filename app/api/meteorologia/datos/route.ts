import { CITIES } from "@/lib/pipeline"

export const runtime = "nodejs"
const TABLE = "mediciones_meteorologicas"
const timestampPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/

function isLocalDevelopment(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase()
  return process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host || "")
}

function configuration() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SECRET_KEY en el servidor.")
  return { url: url.replace(/\/$/, ""), key }
}

export async function GET(request: Request) {
  if (!isLocalDevelopment(request)) return Response.json({ error: "La consulta está habilitada solo en desarrollo local. Configura autenticación antes de publicar." }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get("page") || 0)
  const pageSize = Number(searchParams.get("pageSize") || 25)
  const sort = searchParams.get("sort") || "fecha_hora"
  const direction = searchParams.get("direction") || "desc"
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger(page * pageSize)) {
    return Response.json({ error: "La página debe ser un entero no negativo y pageSize debe estar entre 1 y 100." }, { status: 400 })
  }
  if (!["ciudad", "fecha_hora", "temperatura_c", "humedad_pct", "precipitacion_mm", "importado_en"].includes(sort)) {
    return Response.json({ error: "El campo de ordenación no es válido." }, { status: 400 })
  }
  if (direction !== "asc" && direction !== "desc") {
    return Response.json({ error: "La dirección debe ser asc o desc." }, { status: 400 })
  }
  const city = searchParams.get("city")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  if (city && !CITIES.some((item) => item.name === city)) {
    return Response.json({ error: "La ciudad no está permitida." }, { status: 400 })
  }
  if ((from && (!timestampPattern.test(from) || Number.isNaN(Date.parse(from)))) ||
      (to && (!timestampPattern.test(to) || Number.isNaN(Date.parse(to))))) {
    return Response.json({ error: "Las fechas deben ser válidas e incluir zona horaria." }, { status: 400 })
  }
  if (from && to && Date.parse(from) > Date.parse(to)) {
    return Response.json({ error: "La fecha inicial debe ser anterior o igual a la fecha final." }, { status: 400 })
  }
  const ascending = direction === "asc"
  const params = new URLSearchParams({ select: "id,ciudad,fecha_hora,temperatura_c,humedad_pct,precipitacion_mm,importado_en", order: `${sort}.${ascending ? "asc" : "desc"}`, offset: String(page * pageSize), limit: String(pageSize) })
  if (city) params.set("ciudad", `eq.${city}`)
  if (from) params.set("fecha_hora", `gte.${from}`)
  if (to) params.append("fecha_hora", `lte.${to}`)
  try {
    const { url, key } = configuration()
    const result = await fetch(`${url}/rest/v1/${TABLE}?${params}`, { cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: `${page * pageSize}-${page * pageSize + pageSize - 1}` } })
    if (!result.ok) return Response.json({ error: `No se pudieron consultar los datos (${result.status}): ${await result.text()}` }, { status: 502 })
    const contentRange = result.headers.get("content-range") || "*/0"
    const total = Number(contentRange.split("/")[1]) || 0
    return Response.json({ rows: await result.json(), total, page, pageSize })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error de conexión." }, { status: 503 })
  }
}
