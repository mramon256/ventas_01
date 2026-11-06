import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { POST } from "../app/api/agente/route.ts"

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  AGENT_API_URL: process.env.AGENT_API_URL,
  AGENT_API_KEY: process.env.AGENT_API_KEY,
  AGENT_MODEL: process.env.AGENT_MODEL,
}
const originalFetch = globalThis.fetch

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  globalThis.fetch = originalFetch
})

function localRequest(body, url = "http://localhost:3000/api/agente") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  })
}

test("rechaza el endpoint fuera de desarrollo local", async () => {
  process.env.NODE_ENV = "production"
  const response = await POST(localRequest({ prompt: "Ayúdame con el ETL." }))

  assert.equal(response.status, 403)
})

test("rechaza solicitudes locales sin origen o con otro origen", async () => {
  process.env.NODE_ENV = "development"
  const missingOrigin = new Request("http://localhost:3000/api/agente", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "Ayúdame con el ETL." }),
  })
  const otherOrigin = localRequest({ prompt: "Ayúdame con el ETL." })
  otherOrigin.headers.set("origin", "http://example.com")

  assert.equal((await POST(missingOrigin)).status, 403)
  assert.equal((await POST(otherOrigin)).status, 403)
})

test("valida el prompt antes de llamar al proveedor", async () => {
  process.env.NODE_ENV = "development"
  const response = await POST(localRequest({ prompt: "  " }))

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /prompt/)
})

test("informa cuando falta la configuración del proveedor", async () => {
  process.env.NODE_ENV = "development"
  delete process.env.AGENT_API_URL
  delete process.env.AGENT_API_KEY
  delete process.env.AGENT_MODEL

  const response = await POST(localRequest({ prompt: "Ayúdame con el ETL." }))

  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /AGENT_API_URL/)
})

test("envía el prompt al endpoint configurado y devuelve la respuesta", async () => {
  process.env.NODE_ENV = "development"
  process.env.AGENT_API_URL = "https://agent.example/v1/chat/completions"
  process.env.AGENT_API_KEY = "server-only-test-key"
  process.env.AGENT_MODEL = "test-model"

  let upstreamRequest
  globalThis.fetch = async (input, init) => {
    upstreamRequest = { input, init }
    return Response.json({
      choices: [{ message: { content: "  Revisa los datos antes de cargarlos.  " } }],
    })
  }

  const response = await POST(localRequest({ prompt: "  ¿Cómo limpio los registros?  " }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { reply: "Revisa los datos antes de cargarlos." })
  assert.equal(String(upstreamRequest.input), "https://agent.example/v1/chat/completions")
  assert.equal(upstreamRequest.init.headers.Authorization, "Bearer server-only-test-key")
  assert.deepEqual(JSON.parse(upstreamRequest.init.body).messages[1], {
    role: "user",
    content: "¿Cómo limpio los registros?",
  })
})
