export const CITIES = [
  { name: "Barcelona", latitude: 41.3874, longitude: 2.1686 },
  { name: "Madrid", latitude: 40.4168, longitude: -3.7038 },
  { name: "Sevilla", latitude: 37.3891, longitude: -5.9845 },
  { name: "Bilbao", latitude: 43.263, longitude: -2.935 },
  { name: "Valencia", latitude: 39.4699, longitude: -0.3763 },
] as const

export type City = (typeof CITIES)[number]["name"]
export type WeatherRecord = {
  ciudad: City
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}
export type RejectedRecord = {
  ciudad: string
  fecha_hora: string
  temperatura_2m: unknown
  relative_humidity_2m: unknown
  precipitation: unknown
  motivo: string
}
export type NormalizedCandidate = {
  ciudad: string
  fecha_hora: string
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
}
export type HourlyPayload = {
  hourly?: {
    time?: unknown[]
    temperature_2m?: unknown[]
    relative_humidity_2m?: unknown[]
    precipitation?: unknown[]
  }
  [key: string]: unknown
}

export function transformCity(city: string, payload: HourlyPayload) {
  const hourly = payload.hourly
  const times = hourly?.time
  const temperatures = hourly?.temperature_2m
  const humidity = hourly?.relative_humidity_2m
  const precipitation = hourly?.precipitation
  if (![times, temperatures, humidity, precipitation].every(Array.isArray)) {
    return { rows: [] as NormalizedCandidate[], errors: ["La respuesta no contiene todos los arrays horarios requeridos."] }
  }

  const timeArray = times as unknown[]
  const temperatureArray = temperatures as unknown[]
  const humidityArray = humidity as unknown[]
  const precipitationArray = precipitation as unknown[]
  const arrays = [timeArray, temperatureArray, humidityArray, precipitationArray]
  const lengths = arrays.map((array) => array.length)
  const errors = lengths.every((length) => length === lengths[0])
    ? []
    : [`Arrays horarios con longitudes incoherentes: ${lengths.join(", ")}.`]
  const rows: NormalizedCandidate[] = []

  for (let index = 0; index < Math.max(...lengths); index += 1) {
    const time = timeArray[index]
    const temperature = temperatureArray[index]
    const humidityValue = humidityArray[index]
    const precipitationValue = precipitationArray[index]
    const timestamp = typeof time === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(time)
      ? `${time.replace(" ", "T")}Z`
      : String(time ?? "")
    rows.push({ ciudad: city, fecha_hora: timestamp, temperatura_c: temperature, humedad_pct: humidityValue, precipitacion_mm: precipitationValue })
  }
  return { rows, errors }
}

export function cleanRows(candidates: NormalizedCandidate[]) {
  const rows: WeatherRecord[] = []
  const rejected: RejectedRecord[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const reasons: string[] = []
    if (!CITIES.some((item) => item.name === candidate.ciudad)) reasons.push("Ciudad ausente o no reconocida.")
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?Z$/.test(candidate.fecha_hora) || Number.isNaN(Date.parse(candidate.fecha_hora))) reasons.push("Fecha y hora UTC no válida o ausente.")
    const values = [candidate.temperatura_c, candidate.humedad_pct, candidate.precipitacion_mm]
    if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) reasons.push("Falta una medición numérica finita (null y valores ausentes no se convierten en cero).")
    if (typeof candidate.humedad_pct === "number" && Number.isFinite(candidate.humedad_pct) && (candidate.humedad_pct < 0 || candidate.humedad_pct > 100)) reasons.push("La humedad debe estar entre 0 y 100 %.")
    if (typeof candidate.precipitacion_mm === "number" && Number.isFinite(candidate.precipitacion_mm) && candidate.precipitacion_mm < 0) reasons.push("La precipitación no puede ser negativa.")
    const key = `${candidate.ciudad}|${candidate.fecha_hora}`
    if (!reasons.length && seen.has(key)) reasons.push("Duplicado por ciudad y fecha_hora; se conserva la primera fila válida recibida.")
    if (!reasons.length) seen.add(key)
    if (reasons.length) {
      rejected.push({ ciudad: candidate.ciudad, fecha_hora: candidate.fecha_hora, temperatura_2m: candidate.temperatura_c, relative_humidity_2m: candidate.humedad_pct, precipitation: candidate.precipitacion_mm, motivo: reasons.join(" ") })
    } else {
      rows.push({ ciudad: candidate.ciudad as City, fecha_hora: candidate.fecha_hora, temperatura_c: candidate.temperatura_c as number, humedad_pct: candidate.humedad_pct as number, precipitacion_mm: candidate.precipitacion_mm as number })
    }
  }
  return { rows, rejected }
}

export type Filters = {
  cities: City[]
  from: string
  to: string
  minTemp: string
  maxTemp: string
  minHumidity: string
  maxHumidity: string
  minRain: string
  maxRain: string
  rainOnly: boolean
  sortBy: "ciudad" | "fecha_hora" | "temperatura_c" | "humedad_pct" | "precipitacion_mm"
  direction: "asc" | "desc"
}

export type SelectionMode = "automatic" | "manual"

export function resolveSelection(rows: WeatherRecord[], manualSelection: ReadonlySet<string>, mode: SelectionMode) {
  return mode === "automatic"
    ? new Set(rows.map((row) => `${row.ciudad}|${row.fecha_hora}`))
    : new Set(manualSelection)
}

export function applyFilters(rows: WeatherRecord[], filters: Filters) {
  return rows.filter((row) =>
    (!filters.cities.length || filters.cities.includes(row.ciudad)) &&
    (!filters.from || row.fecha_hora >= `${filters.from}:00Z`) &&
    (!filters.to || row.fecha_hora <= `${filters.to}:59Z`) &&
    (!filters.minTemp || row.temperatura_c >= Number(filters.minTemp)) &&
    (!filters.maxTemp || row.temperatura_c <= Number(filters.maxTemp)) &&
    (!filters.minHumidity || row.humedad_pct >= Number(filters.minHumidity)) &&
    (!filters.maxHumidity || row.humedad_pct <= Number(filters.maxHumidity)) &&
    (!filters.minRain || row.precipitacion_mm >= Number(filters.minRain)) &&
    (!filters.maxRain || row.precipitacion_mm <= Number(filters.maxRain)) &&
    (!filters.rainOnly || row.precipitacion_mm > 0),
  ).sort((left, right) => {
    const a = left[filters.sortBy]
    const b = right[filters.sortBy]
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es")
    return filters.direction === "asc" ? comparison : -comparison
  })
}

export function validateRecords(records: unknown): records is WeatherRecord[] {
  const timestampPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?Z$/
  const fields = ["ciudad", "fecha_hora", "temperatura_c", "humedad_pct", "precipitacion_mm"]

  return Array.isArray(records) && records.every((row): row is WeatherRecord => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false
    const record = row as Record<string, unknown>
    if (Object.keys(record).length !== fields.length || fields.some((field) => !(field in record))) return false

    return CITIES.some((city) => city.name === record.ciudad) &&
      typeof record.fecha_hora === "string" &&
      timestampPattern.test(record.fecha_hora) &&
      !Number.isNaN(Date.parse(record.fecha_hora)) &&
      ["temperatura_c", "humedad_pct", "precipitacion_mm"].every(
        (field) => typeof record[field] === "number" && Number.isFinite(record[field]),
      ) &&
      (record.humedad_pct as number) >= 0 &&
      (record.humedad_pct as number) <= 100 &&
      (record.precipitacion_mm as number) >= 0
  })
}
