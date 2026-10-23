import assert from "node:assert/strict"
import test from "node:test"
import { applyFilters, cleanRows, transformCity } from "../lib/pipeline.ts"

const emptyFilters = {
  cities: [], from: "", to: "", minTemp: "", maxTemp: "", minHumidity: "", maxHumidity: "", minRain: "", maxRain: "", rainOnly: false, sortBy: "fecha_hora", direction: "asc",
}
const row = (hour, temperature = hour, city = "Barcelona") => ({ ciudad: city, fecha_hora: `2026-09-01T${String(hour).padStart(2, "0")}:00:00Z`, temperatura_c: temperature, humedad_pct: 55, precipitacion_mm: hour % 2 ? 0.2 : 0 })

test("transforma un día horario en 24 filas UTC", () => {
  const payload = { hourly: { time: Array.from({ length: 24 }, (_, hour) => `2026-09-01T${String(hour).padStart(2, "0")}:00`), temperature_2m: Array(24).fill(20), relative_humidity_2m: Array(24).fill(50), precipitation: Array(24).fill(0) } }
  const transformed = transformCity("Barcelona", payload)
  assert.equal(transformed.rows.length, 24)
  assert.equal(transformed.rows[0].fecha_hora, "2026-09-01T00:00Z")
  assert.match(transformed.rows[23].fecha_hora, /Z$/)
})

test("conserva null en transformación y lo rechaza sin convertirlo en cero", () => {
  const candidate = { ciudad: "Barcelona", fecha_hora: "2026-09-01T00:00Z", temperatura_c: null, humedad_pct: 50, precipitacion_mm: 0 }
  assert.equal(transformCity("Barcelona", { hourly: { time: ["2026-09-01T00:00"], temperature_2m: [null], relative_humidity_2m: [50], precipitation: [0] } }).rows[0].temperatura_c, null)
  const cleaned = cleanRows([candidate])
  assert.equal(cleaned.rows.length, 0)
  assert.match(cleaned.rejected[0].motivo, /Falta una medición/)
})

test("detecta duplicados por ciudad y hora y conserva la primera fila", () => {
  const first = row(0, 18)
  const duplicate = row(0, 99)
  const cleaned = cleanRows([first, duplicate])
  assert.equal(cleaned.rows.length, 1)
  assert.equal(cleaned.rows[0].temperatura_c, 18)
  assert.match(cleaned.rejected[0].motivo, /Duplicado/)
})

test("filtra, ordena y después pagina el conjunto reducido", () => {
  const rows = Array.from({ length: 48 }, (_, index) => row(index % 24, index))
  const filtered = applyFilters(rows, { ...emptyFilters, minTemp: "20", sortBy: "temperatura_c", direction: "desc" })
  assert.equal(filtered.length, 28)
  assert.deepEqual(filtered.slice(0, 3).map((item) => item.temperatura_c), [47, 46, 45])
  assert.equal(filtered.slice(20, 40).length, 8)
})

test("selecciona filas de varias páginas y no incorpora filas nuevas al cambiar filtros", () => {
  const rows = Array.from({ length: 60 }, (_, index) => row(index % 24, index))
  const sorted = applyFilters(rows, { ...emptyFilters, sortBy: "temperatura_c", direction: "asc" })
  const selectedKeys = new Set([sorted[0], sorted[42]].map((item) => `${item.ciudad}|${item.fecha_hora}`))
  const changed = applyFilters(rows, { ...emptyFilters, minTemp: "30", sortBy: "temperatura_c", direction: "asc" })
  assert.equal(changed.filter((item) => selectedKeys.has(`${item.ciudad}|${item.fecha_hora}`)).length, 2)
  assert.ok(changed.length > selectedKeys.size)
  assert.equal(selectedKeys.size, 2)
})

test("la instantánea conserva exactamente la vista previa ordenada seleccionada", () => {
  const rows = [row(3), row(1), row(2)]
  const ordered = applyFilters(rows, { ...emptyFilters, sortBy: "fecha_hora", direction: "desc" })
  const selected = new Set([`${rows[0].ciudad}|${rows[0].fecha_hora}`, `${rows[2].ciudad}|${rows[2].fecha_hora}`])
  const preview = ordered.filter((item) => selected.has(`${item.ciudad}|${item.fecha_hora}`))
  const frozen = structuredClone(preview)
  applyFilters(rows, { ...emptyFilters, rainOnly: true })
  assert.deepEqual(frozen, [rows[0], rows[2]])
})
