import { validateRecords, type WeatherRecord } from "@/lib/pipeline"

export const runtime = "nodejs"
const TABLE = "mediciones_meteorologicas"
const MAX_BODY_BYTES = 1_000_000

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

export async function POST(request: Request) {
  if (!isLocalDevelopment(request)) return Response.json({ error: "La carga está habilitada solo en desarrollo local. Configura autenticación antes de publicar." }, { status: 403 })
  const length = Number(request.headers.get("content-length") || 0)
  if (length > MAX_BODY_BYTES) return Response.json({ error: "La petición supera el tamaño máximo de 1 MB." }, { status: 413 })
  let body: { records?: unknown }
  try {
    if (!request.body) return Response.json({ error: "La petición no contiene un cuerpo JSON." }, { status: 400 })
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return Response.json({ error: "La petición supera el tamaño máximo de 1 MB." }, { status: 413 }) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    body = JSON.parse(new TextDecoder().decode(bytes)) as { records?: unknown }
  } catch { return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 }) }
  if (!validateRecords(body.records) || body.records.length < 1 || body.records.length > 500) return Response.json({ error: "Envía entre 1 y 500 registros válidos." }, { status: 400 })
  const keys = new Set<string>()
  for (const record of body.records as WeatherRecord[]) {
    if (!/(Z|[+-]\d\d:\d\d)$/.test(record.fecha_hora)) return Response.json({ error: "Cada fecha_hora debe incluir zona horaria." }, { status: 400 })
    const key = `${record.ciudad}|${record.fecha_hora}`
    if (keys.has(key)) return Response.json({ error: "El lote contiene claves ciudad/fecha_hora duplicadas." }, { status: 400 })
    keys.add(key)
  }
  try {
    const { url, key } = configuration()
    const response = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=ciudad%2Cfecha_hora`, {
      method: "POST", cache: "no-store",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body.records),
    })
    if (!response.ok) return Response.json({ error: `Supabase rechazó el lote (${response.status}): ${await response.text()}` }, { status: 502 })

    const groups = new Map<string, string[]>()
    for (const record of body.records as WeatherRecord[]) groups.set(record.ciudad, [...(groups.get(record.ciudad) || []), record.fecha_hora])
    const found = new Set<string>()
    for (const [city, times] of groups) {
      const min = times.reduce((a, b) => a < b ? a : b)
      const max = times.reduce((a, b) => a > b ? a : b)
      const params = new URLSearchParams({ select: "ciudad,fecha_hora", ciudad: `eq.${city}`, fecha_hora: `gte.${min}` })
      params.append("fecha_hora", `lte.${max}`)
      const check = await fetch(`${url}/rest/v1/${TABLE}?${params}`, { cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}` } })
      if (!check.ok) return Response.json({ error: `El lote se escribió, pero falló la verificación en Supabase (${check.status}).` }, { status: 502 })
      const persisted = await check.json() as Array<{ ciudad: string; fecha_hora: string }>
      for (const row of persisted) found.add(`${row.ciudad}|${Date.parse(row.fecha_hora)}`)
    }
    const missing = (body.records as WeatherRecord[]).filter((record) => !found.has(`${record.ciudad}|${Date.parse(record.fecha_hora)}`)).length
    if (missing) return Response.json({ error: `Supabase aceptó la escritura, pero la verificación no encontró ${missing} claves.`, verified: (body.records as WeatherRecord[]).length - missing }, { status: 502 })
    return Response.json({ ok: true, processed: (body.records as WeatherRecord[]).length, verified: (body.records as WeatherRecord[]).length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de configuración o conexión con Supabase."
    return Response.json({ error: message }, { status: 503 })
  }
}
