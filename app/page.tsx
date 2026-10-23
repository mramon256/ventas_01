"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { applyFilters, CITIES, cleanRows, transformCity, type City, type Filters, type HourlyPayload, type NormalizedCandidate, type RejectedRecord, type WeatherRecord } from "@/lib/pipeline"

type RawEntry = { payload?: HourlyPayload; status: "pendiente" | "en curso" | "completada" | "error"; error?: string; duration?: number }
type Batch = { records: WeatherRecord[]; status: "pendiente" | "cargando" | "completado" | "error"; error?: string; verified?: number }
type DbRow = WeatherRecord & { id: number; importado_en: string }
type Tab = "raw" | "transformados" | "validos" | "rechazados" | "preview" | "destino"
const PAGE_SIZE = 20
const initialFilters: Filters = { cities: [], from: "", to: "", minTemp: "", maxTemp: "", minHumidity: "", maxHumidity: "", minRain: "", maxRain: "", rainOnly: false, sortBy: "fecha_hora", direction: "asc" }
const initialRaw = Object.fromEntries(CITIES.map(({ name }) => [name, { status: "pendiente" as const }])) as Record<City, RawEntry>
const stateLabel: Record<string, string> = { pendiente: "Pendiente", "en curso": "En curso", completada: "Completada", error: "Con errores", cargando: "En curso" }
const datetimeUTC = (value: string, end = false) => value ? `${value.replace("T", "T")}${end ? ":59" : ":00"}Z` : ""
const download = (name: string, content: string) => { const url = URL.createObjectURL(new Blob([content], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url) }

function Metric({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>
}

function RecordTable({ rows, selected, onToggle, selectable = false }: { rows: Array<WeatherRecord | RejectedRecord | DbRow | NormalizedCandidate>; selected?: Set<string>; onToggle?: (row: WeatherRecord) => void; selectable?: boolean }) {
  if (!rows.length) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay filas para mostrar en esta vista.</div>
  return <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] border-collapse text-left text-sm"><thead className="bg-muted/70 text-xs text-muted-foreground"><tr>{selectable && <th className="w-10 px-3 py-3">Sel.</th>}<th className="px-3 py-3">Ciudad</th><th className="px-3 py-3">Fecha y hora (UTC)</th><th className="px-3 py-3">Temperatura (°C)</th><th className="px-3 py-3">Humedad (%)</th><th className="px-3 py-3">Precipitación (mm)</th>{rows.some((row) => "motivo" in row) && <th className="px-3 py-3">Motivo de rechazo</th>}</tr></thead><tbody className="divide-y">{rows.map((row, index) => { const valid = "temperatura_c" in row; const key = valid ? `${row.ciudad}|${row.fecha_hora}|${index}` : `${row.ciudad}|${row.fecha_hora}|${index}`; const display = (value: unknown) => value === null || value === undefined ? "null" : String(value); const temperature = valid ? (row as WeatherRecord | NormalizedCandidate).temperatura_c : (row as RejectedRecord).temperatura_2m; const humidity = valid ? (row as WeatherRecord | NormalizedCandidate).humedad_pct : (row as RejectedRecord).relative_humidity_2m; const rain = valid ? (row as WeatherRecord | NormalizedCandidate).precipitacion_mm : (row as RejectedRecord).precipitation; return <tr key={key} className="hover:bg-muted/40">{selectable && valid && <td className="px-3 py-3"><input type="checkbox" aria-label={`Seleccionar ${row.ciudad} ${row.fecha_hora}`} checked={selected?.has(`${row.ciudad}|${row.fecha_hora}`) || false} onChange={() => onToggle?.(row as WeatherRecord)} /></td>}<td className="px-3 py-3 font-medium">{row.ciudad || "—"}</td><td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.fecha_hora || "—"}</td><td className="px-3 py-3">{display(temperature)}</td><td className="px-3 py-3">{display(humidity)}</td><td className="px-3 py-3">{display(rain)}</td>{"motivo" in row && <td className="max-w-lg px-3 py-3 text-xs text-destructive">{row.motivo}</td>}</tr> })}</tbody></table></div>
}

export default function Page() {
  const [cities, setCities] = useState<City[]>(["Barcelona"])
  const [startDate, setStartDate] = useState("2026-09-01")
  const [endDate, setEndDate] = useState("2026-09-30")
  const [raw, setRaw] = useState(initialRaw)
  const [candidates, setCandidates] = useState<NormalizedCandidate[]>([])
  const [validRows, setValidRows] = useState<WeatherRecord[]>([])
  const [rejected, setRejected] = useState<RejectedRecord[]>([])
  const [shapeErrors, setShapeErrors] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [tab, setTab] = useState<Tab>("raw")
  const [extracting, setExtracting] = useState(false)
  const [transformPage, setTransformPage] = useState(0)
  const [rejectedPage, setRejectedPage] = useState(0)
  const [previewPage, setPreviewPage] = useState(0)
  const [extractDuration, setExtractDuration] = useState<number | null>(null)
  const [transformDuration, setTransformDuration] = useState<number | null>(null)
  const [cleanDuration, setCleanDuration] = useState<number | null>(null)
  const [selectionDuration, setSelectionDuration] = useState<number | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [uploading, setUploading] = useState(false)
  const uploadLock = useRef(false)
  const [uploadDuration, setUploadDuration] = useState<number | null>(null)
  const [dbRows, setDbRows] = useState<DbRow[]>([])
  const [dbTotal, setDbTotal] = useState(0)
  const [dbPage, setDbPage] = useState(0)
  const [dbCity, setDbCity] = useState("")
  const [dbFrom, setDbFrom] = useState("")
  const [dbTo, setDbTo] = useState("")
  const [dbSort, setDbSort] = useState("fecha_hora")
  const [dbDirection, setDbDirection] = useState<"asc" | "desc">("desc")
  const [dbError, setDbError] = useState("")
  const [dbLoading, setDbLoading] = useState(false)
  const [message, setMessage] = useState("")

  const totalExtracted = Object.values(raw).reduce((sum, entry) => sum + (entry.payload?.hourly?.time?.length || 0), 0)
  const processedCities = CITIES.filter(({ name }) => raw[name].status === "completada" || raw[name].status === "error")
  const pendingCities = CITIES.filter(({ name }) => raw[name].status === "pendiente")
  const filteredResult = useMemo(() => { const started = performance.now(); const rows = applyFilters(validRows, filters); return { rows, duration: performance.now() - started } }, [validRows, filters])
  const filteredRows = filteredResult.rows
  const filteredIds = useMemo(() => new Set(filteredRows.map((row) => `${row.ciudad}|${row.fecha_hora}`)), [filteredRows])
  const selectedCount = [...selected].filter((key) => validRows.some((row) => `${row.ciudad}|${row.fecha_hora}` === key)).length
  const selectedOutside = [...selected].filter((key) => validRows.some((row) => `${row.ciudad}|${row.fecha_hora}` === key) && !filteredIds.has(key)).length
  const failedBatches = batches.filter((batch) => batch.status === "error").length
  const previewRows = filteredRows.filter((row) => selected.has(`${row.ciudad}|${row.fecha_hora}`))
  const frozenRows = batches.flatMap((batch) => batch.records)
  const sameAsFrozen = previewRows.length === frozenRows.length && previewRows.every((row, index) => `${row.ciudad}|${row.fecha_hora}` === `${frozenRows[index]?.ciudad}|${frozenRows[index]?.fecha_hora}`)
  const frozenActive = batches.length > 0 && (failedBatches > 0 || uploading || sameAsFrozen)
  const displayedPreview = frozenActive ? frozenRows : previewRows
  const displayedPreviewPageCount = Math.max(1, Math.ceil(displayedPreview.length / PAGE_SIZE))
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const visibleRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const uploadable = batches.length ? batches.reduce((sum, batch) => sum + batch.records.length, 0) : previewRows.length
  const extractionStatus = extracting ? "en curso" : processedCities.length ? (processedCities.some(({ name }) => raw[name].status === "error") ? "error" : "completada") : "pendiente"
  const transformStatus = shapeErrors.length ? "error" : candidates.length ? "completada" : "pendiente"
  const cleanStatus = validRows.length || rejected.length ? "completada" : "pendiente"
  const filterStatus = candidates.length ? "completada" : "pendiente"
  const uploadStatus = uploading ? "en curso" : batches.length ? (failedBatches ? "error" : batches.every((batch) => batch.status === "completado") ? "completada" : "pendiente") : "pendiente"

  const runTransform = useCallback(() => {
    const started = performance.now()
    const all: NormalizedCandidate[] = []
    const errors: string[] = []
    for (const { name } of CITIES) {
      const payload = raw[name].payload
      if (payload) {
        const result = transformCity(name, payload)
        all.push(...result.rows)
        errors.push(...result.errors.map((error) => `${name}: ${error}`))
      }
    }
    setCandidates(all)
    setShapeErrors(errors)
    setTransformDuration(performance.now() - started)
    const cleanStarted = performance.now()
    const cleaned = cleanRows(all)
    setValidRows(cleaned.rows)
    setRejected(cleaned.rejected)
    setCleanDuration(performance.now() - cleanStarted)
    setSelected((current) => new Set([...current].filter((key) => cleaned.rows.some((row) => `${row.ciudad}|${row.fecha_hora}` === key))))
  }, [raw])

  useEffect(() => { runTransform() }, [raw, runTransform])

  async function fetchCity(city: City, from: string, to: string) {
    const location = CITIES.find((item) => item.name === city)!
    const query = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), start_date: from, end_date: to, hourly: "temperature_2m,relative_humidity_2m,precipitation", timezone: "GMT", temperature_unit: "celsius", precipitation_unit: "mm" })
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${query}`)
    const payload = await response.json() as HourlyPayload & { reason?: string }
    if (!response.ok || payload.reason) throw new Error(payload.reason || `Open-Meteo respondió ${response.status}.`)
    return payload
  }

  async function extract(targets = cities, retryOnly = false) {
    const days = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1
    if (!targets.length) { setMessage("Selecciona al menos una ciudad."); return }
    if (!startDate || !endDate || Number.isNaN(days) || days < 1) { setMessage("Indica un intervalo de fechas válido."); return }
    if (days > 31) { setMessage("La extracción está limitada a un máximo de 31 días."); return }
    setMessage("")
    if (!retryOnly) { setSelected(new Set()); setBatches([]); setPage(0); setPreviewPage(0) }
    setExtracting(true)
    const started = performance.now()
    setRaw((current) => retryOnly ? ({ ...current, ...Object.fromEntries(targets.map((city) => [city, { status: "en curso" as const }])) }) : Object.fromEntries(CITIES.map(({ name }) => [name, targets.includes(name) ? { status: "en curso" as const } : { status: "pendiente" as const }])) as Record<City, RawEntry>)
    for (const city of targets) {
      const cityStarted = performance.now()
      try {
        const payload = await fetchCity(city, startDate, endDate)
        setRaw((current) => ({ ...current, [city]: { payload, status: "completada", duration: performance.now() - cityStarted } }))
      } catch (error) {
        setRaw((current) => ({ ...current, [city]: { status: "error", error: error instanceof Error ? error.message : "Error desconocido.", duration: performance.now() - cityStarted } }))
      }
    }
    setExtractDuration(performance.now() - started)
    setExtracting(false)
  }

  function toggleRow(row: WeatherRecord) {
    const key = `${row.ciudad}|${row.fecha_hora}`
    const started = performance.now()
    const next = new Set(selected)
    if (next.has(key)) next.delete(key); else next.add(key)
    setSelected(next)
    setSelectionDuration(performance.now() - started)
  }

  async function upload(indices?: number[]) {
    if (uploadLock.current) return
    const snapshot = frozenActive ? batches : Array.from({ length: Math.ceil(previewRows.length / 500) }, (_, index) => ({ records: previewRows.slice(index * 500, (index + 1) * 500), status: "pendiente" as const }))
    if (!snapshot.length) { setMessage("Selecciona registros que sigan coincidiendo con los filtros actuales."); return }
    const toSend = indices || snapshot.map((batch, index) => batch.status === "pendiente" || batch.status === "error" ? index : -1).filter((index) => index >= 0)
    if (!toSend.length) { setMessage("No hay lotes pendientes o fallidos para enviar."); return }
    uploadLock.current = true
    setUploading(true)
    setMessage("")
    const started = performance.now()
    const current = snapshot.map((batch) => ({ ...batch }))
    setBatches(current)
    for (const index of toSend) {
      const batch = current[index]
      if (!batch || batch.status === "completado") continue
      current[index] = { ...batch, status: "cargando", error: undefined }
      setBatches([...current])
      try {
        const response = await fetch("/api/meteorologia/carga", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: batch.records }) })
        const result = await response.json() as { error?: string; verified?: number }
        if (!response.ok) throw new Error(result.error || `Error HTTP ${response.status}`)
        current[index] = { ...batch, status: "completado", verified: result.verified }
      } catch (error) { current[index] = { ...batch, status: "error", error: error instanceof Error ? error.message : "Error de red." } }
      setBatches([...current])
    }
    setUploadDuration(performance.now() - started)
    setUploading(false)
    uploadLock.current = false
    const ok = current.filter((batch) => batch.status === "completado").reduce((sum, batch) => sum + batch.records.length, 0)
    const bad = current.filter((batch) => batch.status === "error").reduce((sum, batch) => sum + batch.records.length, 0)
    setMessage(`Operación terminada: ${ok} registros procesados y verificados; ${bad} en lotes fallidos.`)
    if (tab === "destino") void loadDatabase()
  }

  const loadDatabase = useCallback(async () => {
    setDbLoading(true); setDbError("")
    const query = new URLSearchParams({ page: String(dbPage), pageSize: "25", sort: dbSort, direction: dbDirection })
    if (dbCity) query.set("city", dbCity)
    if (dbFrom) query.set("from", datetimeUTC(dbFrom))
    if (dbTo) query.set("to", datetimeUTC(dbTo, true))
    try {
      const response = await fetch(`/api/meteorologia/datos?${query}`)
      const result = await response.json() as { rows?: DbRow[]; total?: number; error?: string }
      if (!response.ok) throw new Error(result.error || "No se pudieron leer los datos.")
      setDbRows(result.rows || []); setDbTotal(result.total || 0)
    } catch (error) { setDbError(error instanceof Error ? error.message : "Error de lectura."); setDbRows([]) }
    finally { setDbLoading(false) }
  }, [dbPage, dbCity, dbFrom, dbTo, dbSort, dbDirection])
  useEffect(() => { if (tab === "destino") void loadDatabase() }, [tab, loadDatabase])

  const changeFilter = (key: keyof Filters, value: string | boolean | City[] | Filters["sortBy"] | Filters["direction"]) => { setFilters((current) => ({ ...current, [key]: value } as Filters)); setPage(0); setSelectionDuration(null) }
  const tabs: Array<[Tab, string, number]> = [["raw", "JSON original", Object.keys(raw).filter((city) => raw[city as City].payload).length], ["transformados", "Transformados", candidates.length], ["validos", "Válidos", validRows.length], ["rechazados", "Rechazados", rejected.length], ["preview", "Vista previa de carga", previewRows.length], ["destino", "Datos en Supabase", dbTotal]]

  return <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-[1440px] space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.22em] text-primary">Práctica de Big Data · ETL 01</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Pipeline meteorológico</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Extrae, transforma, limpia y selecciona datos horarios de Open-Meteo antes de cargarlos y verificarlos en Supabase.</p></div><div className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Fuente</span> · Archivo histórico Open-Meteo<br/><span className="font-semibold text-foreground">Zona horaria</span> · UTC</div></header>

      <section aria-labelledby="config-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="config-heading" className="text-lg font-semibold">1. Configuración de extracción</h2><p className="mt-1 text-sm text-muted-foreground">Hasta 31 días por extracción. El volumen previsto es de 24 registros por ciudad y día.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{cities.length * Math.max(0, Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1) * 24 || 0} filas previstas</span></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-end"><fieldset><legend className="mb-2 text-sm font-medium">Ciudades</legend><div className="flex flex-wrap gap-2">{CITIES.map(({ name }) => <label key={name} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${cities.includes(name) ? "border-primary bg-primary/5" : "bg-background"}`}><input className="mr-2 accent-primary" type="checkbox" checked={cities.includes(name)} onChange={() => setCities((current) => current.includes(name) ? current.filter((city) => city !== name) : [...current, name])}/>{name}</label>)}</div></fieldset><label className="grid gap-2 text-sm">Fecha inicial<input className="h-10 rounded-lg border bg-background px-3" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)}/></label><label className="grid gap-2 text-sm">Fecha final<input className="h-10 rounded-lg border bg-background px-3" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}/></label><Button disabled={extracting || !cities.length} onClick={() => void extract()}>{extracting ? "Extrayendo…" : "Extraer datos"}</Button></div>
        {message && <p role="status" className="mt-4 rounded-lg border bg-muted px-4 py-3 text-sm">{message}</p>}{shapeErrors.map((error) => <p key={error} role="alert" className="mt-2 text-sm text-destructive">{error}</p>)}
        {processedCities.length > 0 && <div className="mt-4 flex flex-wrap gap-4 text-sm"><p><strong>Procesadas:</strong> {processedCities.map(({ name }) => `${name}${raw[name].status === "error" ? " (error)" : ""}`).join(", ") || "ninguna"}</p><p><strong>En curso:</strong> {CITIES.filter(({ name }) => raw[name].status === "en curso").map(({ name }) => name).join(", ") || "ninguna"}</p><p><strong>Pendientes:</strong> {pendingCities.map(({ name }) => name).join(", ") || "ninguna"}</p></div>}
        {CITIES.some(({ name }) => raw[name].status === "error") && <div className="mt-3 space-y-2">{CITIES.filter(({ name }) => raw[name].status === "error").map(({ name }) => <div key={name} className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-3 text-sm"><span><strong>{name}:</strong> {raw[name].error}</span><Button variant="outline" size="sm" disabled={extracting} onClick={() => void extract([name], true)}>Reintentar {name}</Button></div>)}</div>}
      </section>

      <section aria-labelledby="pipeline-heading"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 id="pipeline-heading" className="text-lg font-semibold">2. Estado del pipeline</h2><p className="text-sm text-muted-foreground">Los estados y duraciones se calculan con cada operación real.</p></div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{[
        ["Extracción", extractionStatus, `${totalExtracted} registros de entrada`, `${processedCities.length} ciudades terminadas`, extractDuration],
        ["Transformación", transformStatus, `${totalExtracted} registros de entrada`, `${candidates.length} normalizados`, transformDuration],
        ["Limpieza", cleanStatus, `${candidates.length} registros de entrada`, `${validRows.length} válidos · ${rejected.length} rechazados`, cleanDuration],
        ["Filtrado y selección", filterStatus, `${validRows.length} válidos de entrada`, `${filteredRows.length} coinciden · ${selectedCount} seleccionados`, selectionDuration ?? filteredResult.duration],
        ["Carga", uploadStatus, `${uploadable} filas en el conjunto congelado`, `${batches.filter((batch) => batch.status === "completado").reduce((sum, batch) => sum + batch.records.length, 0)} verificadas · ${failedBatches} lotes fallidos`, uploadDuration],
      ].map(([title, status, input, output, duration], index) => <article key={String(title)} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{index + 1}. {title as string}</p><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${status === "completada" ? "bg-emerald-100 text-emerald-900" : status === "error" ? "bg-red-100 text-red-900" : status === "en curso" ? "bg-blue-100 text-blue-900" : "bg-muted text-muted-foreground"}`}>{stateLabel[String(status)]}</span></div><p className="mt-3 text-xs text-muted-foreground">Entrada: {input as string}</p><p className="mt-1 text-xs">Salida: {output as string}</p><p className="mt-2 text-xs text-muted-foreground">{duration == null ? "Duración: —" : `Duración: ${(Number(duration) / 1000).toFixed(2)} s`}</p><p className="mt-3 min-h-10 text-xs leading-relaxed text-muted-foreground">{["Descarga hourly en UTC para cada ciudad.", "Convierte arrays paralelos en una fila por ciudad y hora.", "Rechaza faltantes, valores inválidos y duplicados; conserva el primero.", "Aplica filtros, orden y selección antes de paginar.", "Upsert por clave única y verificación posterior por lote."][index]}</p>{index < 4 && <button className="mt-2 text-xs font-medium text-primary underline" onClick={() => setTab((["raw", "transformados", "rechazados", "validos", "preview"] as Tab[])[index])}>Inspeccionar fase</button>}</article>)}</div></section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Total extraído" value={totalExtracted} detail="Filas recibidas en arrays horarios"/><Metric label="Válidos" value={validRows.length} detail="Tras reglas de calidad"/><Metric label="Rechazados" value={rejected.length} detail="Incluye el motivo por fila"/><Metric label="Coinciden con filtros" value={filteredRows.length} detail={`${validRows.length - filteredRows.length} excluidos por filtros`}/><Metric label="Seleccionados para cargar" value={selectedCount} detail={`${selectedOutside} seleccionados fuera de filtros`}/></section>

      <section aria-labelledby="filter-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="filter-heading" className="text-lg font-semibold">3. Filtrado, orden y selección</h2><p className="mt-1 text-sm text-muted-foreground">Orden de operaciones: datos válidos → filtros → ordenación → selección → carga. La paginación solo cambia la vista.</p><p className="text-xs text-muted-foreground">Las fechas y horas escritas aquí se interpretan como UTC.</p></div><Button variant="outline" size="sm" onClick={() => { setFilters(initialFilters); setPage(0) }}>Restablecer filtros</Button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Desde (UTC)", "from", "datetime-local"], ["Hasta (UTC)", "to", "datetime-local"], ["Temperatura mín. °C", "minTemp", "number"], ["Temperatura máx. °C", "maxTemp", "number"], ["Humedad mín. %", "minHumidity", "number"], ["Humedad máx. %", "maxHumidity", "number"], ["Precipitación mín. mm", "minRain", "number"], ["Precipitación máx. mm", "maxRain", "number"]].map(([label, key, type]) => <label key={key} className="grid gap-1.5 text-xs font-medium text-muted-foreground">{label}<input type={type} step={type === "number" ? "any" : undefined} className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground" value={filters[key as keyof Filters] as string} onChange={(event) => changeFilter(key as keyof Filters, event.target.value)}/></label>)}
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Filtrar ciudades<select multiple className="h-20 rounded-lg border bg-background px-2 py-1 text-sm text-foreground" value={filters.cities} onChange={(event) => changeFilter("cities", Array.from(event.target.selectedOptions, (option) => option.value as City))}>{CITIES.map(({ name }) => <option key={name}>{name}</option>)}</select><span className="font-normal">Sin selección: todas. Usa Ctrl/Cmd para elegir varias.</span></label>
          <label className="flex items-center gap-2 self-start pt-2 text-sm"><input type="checkbox" checked={filters.rainOnly} onChange={(event) => changeFilter("rainOnly", event.target.checked)}/>Solo registros con lluvia (&gt; 0 mm)</label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Ordenar por<select className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground" value={filters.sortBy} onChange={(event) => changeFilter("sortBy", event.target.value as Filters["sortBy"])}><option value="ciudad">Ciudad</option><option value="fecha_hora">Fecha y hora</option><option value="temperatura_c">Temperatura</option><option value="humedad_pct">Humedad</option><option value="precipitacion_mm">Precipitación</option></select></label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Dirección<select className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground" value={filters.direction} onChange={(event) => changeFilter("direction", event.target.value as Filters["direction"])}><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></label></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { const started = performance.now(); setSelected(new Set([...selected, ...filteredRows.map((row) => `${row.ciudad}|${row.fecha_hora}`)])); setSelectionDuration(performance.now() - started) }}>Seleccionar todas las coincidencias ({filteredRows.length})</Button><Button size="sm" variant="outline" onClick={() => { const started = performance.now(); setSelected(new Set()); setSelectionDuration(performance.now() - started) }}>Vaciar selección</Button><span className="self-center text-xs text-muted-foreground">La selección no añade filas nuevas cuando cambian los filtros.</span></div>
      </section>

      <section aria-labelledby="inspection-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="inspection-heading" className="text-lg font-semibold">4. Inspección de datos</h2><p className="mt-1 text-sm text-muted-foreground">Tablas paginadas; los JSON originales se guardan durante esta sesión.</p></div>{tab === "preview" && <div className="flex flex-wrap items-center gap-2"><Button disabled={uploading || (frozenActive ? !failedBatches : !previewRows.length)} onClick={() => void upload()}>{frozenActive && failedBatches ? `Reintentar ${batches.filter((batch) => batch.status === "error").reduce((sum, batch) => sum + batch.records.length, 0)} filas fallidas` : `Subir ${previewRows.length} registros a Supabase`}</Button></div>}</div>
        <div role="tablist" aria-label="Vistas de datos" className="mt-5 flex gap-1 overflow-x-auto border-b">{tabs.map(([key, label, count]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setPage(0) }} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}<span className="ml-2 text-xs">{count}</span></button>)}</div>
        <div className="mt-4">{tab === "raw" && <div className="space-y-3">{CITIES.filter(({ name }) => raw[name].payload || cities.includes(name) || raw[name].status === "error").map(({ name }) => <details key={name} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{name} · {stateLabel[raw[name].status]} · {raw[name].payload?.hourly?.time?.length || 0} horas · {raw[name].duration == null ? "duración —" : `${(raw[name].duration / 1000).toFixed(2)} s`}</summary>{raw[name].error && <p role="alert" className="mt-3 text-sm text-destructive">{raw[name].error}</p>}{raw[name].payload && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => download(`open-meteo-${name.toLowerCase()}.json`, JSON.stringify(raw[name].payload, null, 2))}>Descargar JSON</Button><pre className="max-h-96 w-full overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(raw[name].payload, null, 2)}</pre></div>}</details>)}</div>}
          {tab === "transformados" && <><p className="mb-3 text-sm text-muted-foreground">Valores normalizados sin sustituciones: los nulos siguen visibles como null y las horas sin zona recibida se interpretan explícitamente como UTC.</p><RecordTable rows={candidates.slice(transformPage * PAGE_SIZE, (transformPage + 1) * PAGE_SIZE)}/><Pagination page={transformPage} pages={Math.max(1, Math.ceil(candidates.length / PAGE_SIZE))} onChange={setTransformPage} total={candidates.length}/></>}
          {tab === "validos" && <><RecordTable rows={visibleRows} selectable selected={selected} onToggle={toggleRow}/><Pagination page={page} pages={pageCount} onChange={setPage} total={filteredRows.length}/></>}
          {tab === "rechazados" && <><RecordTable rows={rejected.slice(rejectedPage * PAGE_SIZE, (rejectedPage + 1) * PAGE_SIZE)}/><Pagination page={rejectedPage} pages={Math.max(1, Math.ceil(rejected.length / PAGE_SIZE))} onChange={setRejectedPage} total={rejected.length}/></>}
          {tab === "preview" && <div className="space-y-4"><div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Conjunto exacto:</strong> {frozenActive ? "esta es la copia congelada al iniciar la carga; los cambios actuales de filtros no la alteran." : "esta vista respeta el orden elegido y solo incluye seleccionados que todavía cumplen los filtros."} {selectedOutside ? `${selectedOutside} seleccionados quedan fuera y no se enviarán.` : "Ningún seleccionado queda fuera de los filtros."}<p className="mt-1">Una base de datos no conserva el orden de inserción. Para reproducirlo en consultas posteriores, usa ORDER BY fecha_hora (y ciudad si hace falta).</p></div><p className="text-sm font-medium">Vista previa: {displayedPreview.length} registros. {batches.length ? `${batches.filter((batch) => batch.status === "completado").length} lotes completos · ${failedBatches} fallidos.` : "El conjunto se congelará al iniciar la carga."}</p><RecordTable rows={displayedPreview.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE)}/><Pagination page={previewPage} pages={displayedPreviewPageCount} onChange={setPreviewPage} total={displayedPreview.length}/>{batches.length > 0 && <div className="space-y-2">{batches.map((batch, index) => <div key={index} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><span>Lote {index + 1} · {batch.records.length} registros · {stateLabel[batch.status]}</span>{batch.error && <span role="alert" className="text-destructive">{batch.error}</span>}{batch.verified != null && <span className="text-emerald-800">{batch.verified} claves verificadas</span>}</div>)}</div>}</div>}
          {tab === "destino" && <div className="space-y-4"><p className="text-sm text-muted-foreground">Lectura directa desde Supabase mediante la ruta de servidor. Los registros aún no subidos aparecen solo en las vistas locales.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={dbCity} onChange={(event) => { setDbCity(event.target.value); setDbPage(0) }}><option value="">Todas las ciudades</option>{CITIES.map(({ name }) => <option key={name}>{name}</option>)}</select><input aria-label="Destino desde" className="h-10 rounded-lg border bg-background px-3 text-sm" type="date" value={dbFrom.slice(0, 10)} onChange={(event) => { setDbFrom(event.target.value ? `${event.target.value}T00:00` : ""); setDbPage(0) }}/><input aria-label="Destino hasta" className="h-10 rounded-lg border bg-background px-3 text-sm" type="date" value={dbTo.slice(0, 10)} onChange={(event) => { setDbTo(event.target.value ? `${event.target.value}T23:59` : ""); setDbPage(0) }}/><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={dbSort} onChange={(event) => setDbSort(event.target.value)}><option value="ciudad">Ciudad</option><option value="fecha_hora">Fecha y hora</option><option value="temperatura_c">Temperatura</option><option value="humedad_pct">Humedad</option><option value="precipitacion_mm">Precipitación</option><option value="importado_en">Importado en</option></select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={dbDirection} onChange={(event) => setDbDirection(event.target.value as "asc" | "desc")}><option value="asc">Ascendente</option><option value="desc">Descendente</option></select><Button variant="outline" onClick={() => void loadDatabase()} disabled={dbLoading}>{dbLoading ? "Actualizando…" : "Actualizar datos"}</Button></div>{dbError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{dbError}</p>}<RecordTable rows={dbRows}/><Pagination page={dbPage} pages={Math.max(1, Math.ceil(dbTotal / 25))} onChange={setDbPage} total={dbTotal}/></div>}
        </div>
      </section>
      <footer className="rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Uso local de desarrollo:</strong> esta práctica no tiene autenticación. Protege las rutas de carga y lectura con autenticación y autorización antes de publicar la aplicación. La clave secreta solo se consulta en el servidor; RLS sigue activo y la migración no añade políticas públicas.</footer>
    </div>
  </main>
}

function Pagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (page: number) => void; total: number }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{total === 0 ? "0 registros" : `Página ${page + 1} de ${pages} · ${total} registros`}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 0} onClick={() => onChange(page - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>Siguiente</Button></div></div>
}
