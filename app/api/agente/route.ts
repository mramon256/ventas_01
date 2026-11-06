export const runtime = "nodejs"

const MAX_BODY_BYTES = 16 * 1024
const MAX_PROMPT_LENGTH = 4_000
const MAX_REPLY_LENGTH = 8_000
const REQUEST_TIMEOUT_MS = 30_000

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isLocalDevelopment(request: Request) {
  const requestUrl = new URL(request.url)
  const host = requestUrl.hostname.toLowerCase()
  const origin = request.headers.get("origin")

  if (!origin) return false
  try {
    if (new URL(origin).origin !== requestUrl.origin) return false
  } catch {
    return false
  }

  return (
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)
  )
}

function getAgentConfiguration() {
  const endpointValue = process.env.AGENT_API_URL
  const apiKey = process.env.AGENT_API_KEY
  const model = process.env.AGENT_MODEL

  if (!endpointValue || !apiKey || !model) {
    throw new Error("Configura AGENT_API_URL, AGENT_API_KEY y AGENT_MODEL en el servidor.")
  }

  let endpoint: URL
  try {
    endpoint = new URL(endpointValue)
  } catch {
    throw new Error("AGENT_API_URL debe ser una URL válida.")
  }

  const isLocalEndpoint =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname.toLowerCase())
  if (endpoint.protocol !== "https:" && !isLocalEndpoint) {
    throw new Error("AGENT_API_URL debe usar HTTPS.")
  }
  if (endpoint.username || endpoint.password) {
    throw new Error("No incluyas credenciales dentro de AGENT_API_URL.")
  }

  return { endpoint, apiKey, model }
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("La petición no contiene un cuerpo JSON.")

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new Error("La petición supera el tamaño máximo de 16 KB.")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error("El cuerpo debe ser JSON válido.")
  }
}

export async function POST(request: Request) {
  if (!isLocalDevelopment(request)) {
    return Response.json(
      { error: "El agente solo está habilitado en desarrollo local hasta configurar autenticación." },
      { status: 403 },
    )
  }

  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "La petición supera el tamaño máximo de 16 KB." }, { status: 413 })
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el cuerpo JSON."
    const status = message.includes("supera el tamaño máximo") ? 413 : 400
    return Response.json({ error: message }, { status })
  }

  if (!isRecord(body) || typeof body.prompt !== "string") {
    return Response.json({ error: "El campo prompt es obligatorio y debe ser texto." }, { status: 400 })
  }

  const prompt = body.prompt.trim()
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json(
      { error: `El prompt debe contener entre 1 y ${MAX_PROMPT_LENGTH} caracteres.` },
      { status: 400 },
    )
  }

  let configuration: ReturnType<typeof getAgentConfiguration>
  try {
    configuration = getAgentConfiguration()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo leer la configuración del agente."
    return Response.json({ error: message }, { status: 503 })
  }

  let upstream: Response
  try {
    upstream = await fetch(configuration.endpoint, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: configuration.model,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente para una práctica de Big Data sobre datos meteorológicos, ETL, UTC y Supabase. Responde en español, de forma clara y concisa. No afirmes haber consultado datos que no se hayan proporcionado.",
          },
          { role: "user", content: prompt },
        ],
      }),
    })
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "El servicio del agente ha agotado el tiempo de espera."
        : "No se pudo conectar con el servicio del agente."
    return Response.json({ error: message }, { status: 502 })
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `El servicio del agente respondió con el estado ${upstream.status}.` },
      { status: 502 },
    )
  }

  let responseBody: ChatCompletionResponse
  try {
    responseBody = (await upstream.json()) as ChatCompletionResponse
  } catch {
    return Response.json({ error: "El servicio del agente devolvió JSON no válido." }, { status: 502 })
  }

  const reply = responseBody.choices?.[0]?.message?.content
  if (typeof reply !== "string" || !reply.trim() || reply.length > MAX_REPLY_LENGTH) {
    return Response.json(
      { error: "El servicio del agente devolvió una respuesta vacía o con formato no válido." },
      { status: 502 },
    )
  }

  return Response.json({ reply: reply.trim() })
}
