"use client"

import {
  RiArrowRightSLine,
  RiCloseLine,
  RiDatabase2Line,
  RiDownloadCloud2Line,
  RiFilter3Line,
  RiMoonLine,
  RiRefreshLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiShuffleLine,
  RiSparkling2Line,
  RiSunLine,
  RiSunCloudyLine,
} from "@remixicon/react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useState } from "react"

import { AgentDialog } from "@/components/etl/agent-dialog"
import { AplicacionEtl } from "@/components/etl/aplicacion-etl"
import { EstacionesMap } from "@/components/etl/estaciones-map"
import { Button } from "@/components/ui/button"
import { type City } from "@/lib/pipeline"

export type DashboardPanel = "extraction" | "overview" | "pipeline" | "data"

const stages = [
  { id: "extraction", label: "Extracción", detail: "Descargar datos", icon: RiDownloadCloud2Line },
  { id: "pipeline", label: "Transformación", detail: "Pasar a tabla", icon: RiShuffleLine },
  { id: "pipeline", label: "Limpieza", detail: "Quitar errores", icon: RiSparkling2Line },
  { id: "data", label: "Filtrado y selección", detail: "Elegir filas", icon: RiFilter3Line },
  { id: "data", label: "Carga", detail: "Guardar en Supabase", icon: RiDatabase2Line },
] as const

const panelTabs: Array<{ id: DashboardPanel; label: string; icon: typeof RiDownloadCloud2Line }> = [
  { id: "extraction", label: "Extracción", icon: RiDownloadCloud2Line },
  { id: "overview", label: "Resumen", icon: RiSparkling2Line },
  { id: "pipeline", label: "Pipeline", icon: RiShuffleLine },
  { id: "data", label: "Datos", icon: RiDatabase2Line },
]

type ConnectionStatus = "checking" | "connected" | "unavailable" | "unconfigured"

async function requestSupabaseStatus() {
  const query = new URLSearchParams({
    page: "0",
    pageSize: "1",
    sort: "fecha_hora",
    direction: "desc",
  })
  const response = await fetch(`/api/meteorologia/datos?${query}`, { cache: "no-store" })
  const result = (await response.json()) as { error?: unknown }
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `Supabase respondió con el estado ${response.status}.`,
    )
  }
}

export function DashboardInterface({
  supabaseConfigured,
}: {
  supabaseConfigured: boolean
}) {
  const [panel, setPanel] = useState<DashboardPanel>("extraction")
  const [activeStage, setActiveStage] = useState<number | null>(null)
  const [selectedCity, setSelectedCity] = useState<City>("Madrid")
  const [panelOpen, setPanelOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    supabaseConfigured ? "checking" : "unconfigured",
  )
  const [connectionError, setConnectionError] = useState("")
  const { resolvedTheme, setTheme } = useTheme()
  const selectCity = useCallback((city: City) => setSelectedCity(city), [])

  const checkSupabase = useCallback(async () => {
    if (!supabaseConfigured) {
      setConnectionStatus("unconfigured")
      setConnectionError("")
      return
    }

    setConnectionStatus("checking")
    setConnectionError("")

    try {
      await requestSupabaseStatus()
      setConnectionStatus("connected")
    } catch (error) {
      setConnectionStatus("unavailable")
      setConnectionError(error instanceof Error ? error.message : "Error de conexión con Supabase.")
    }
  }, [supabaseConfigured])

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true

    void requestSupabaseStatus().then(
      () => {
        if (active) setConnectionStatus("connected")
      },
      (error: unknown) => {
        if (!active) return
        setConnectionStatus("unavailable")
        setConnectionError(error instanceof Error ? error.message : "Error de conexión con Supabase.")
      },
    )

    return () => {
      active = false
    }
  }, [supabaseConfigured])

  const connectionLabel = {
    checking: "Comprobando…",
    connected: "Conectado",
    unavailable: "Tabla no disponible",
    unconfigured: "Sin configurar",
  }[connectionStatus]

  return (
    <div className="etl-dashboard">
      <header className="etl-topbar">
        <Link href="/" className="etl-brand" aria-label="Meteo ETL, inicio" title="Meteo ETL">
          <RiSunCloudyLine aria-hidden="true" />
        </Link>

        <nav className="etl-stage-nav" aria-label="Fases del pipeline">
          {stages.map((stage, index) => {
            const Icon = stage.icon
            const active = activeStage === index
            return (
              <div className="etl-stage-item" key={`${stage.label}-${index}`}>
                <button
                  type="button"
                  className={active ? "etl-stage-button is-active" : "etl-stage-button"}
                  onClick={() => {
                    setActiveStage(index)
                    setPanel(stage.id)
                    setPanelOpen(true)
                  }}
                  aria-label={`${stage.label} (${stage.detail}): Pendiente, —`}
                  aria-current={active ? "step" : undefined}
                  title={`${index + 1}. ${stage.label} · ${stage.detail}`}
                >
                  <Icon aria-hidden="true" />
                  <span className="etl-stage-status" aria-hidden="true" />
                </button>
                {index < stages.length - 1 && (
                  <RiArrowRightSLine className="etl-stage-arrow" aria-hidden="true" />
                )}
              </div>
            )
          })}
        </nav>

        <div className="etl-topbar__actions">
          <span
            className={`etl-supabase is-${connectionStatus}`}
            role="status"
            aria-label={
              connectionError
                ? `Error de Supabase: ${connectionError}`
                : `Estado de Supabase: ${connectionLabel}`
            }
            title={connectionError || undefined}
          >
            <span className="etl-supabase__dot" aria-hidden="true" />
            <RiDatabase2Line aria-hidden="true" />
            <span>Supabase · {connectionLabel}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="etl-icon-button etl-refresh-button"
            aria-label="Comprobar conexión con Supabase"
            title="Comprobar conexión con Supabase"
            onClick={() => void checkSupabase()}
            disabled={connectionStatus === "checking"}
          >
            <RiRefreshLine aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="etl-icon-button"
            aria-label="Cambiar entre tema claro y oscuro"
            title="Cambiar tema"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <RiSunLine className="dark:hidden" aria-hidden="true" />
            <RiMoonLine className="hidden dark:inline" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="etl-icon-button"
            aria-label={panelOpen ? "Cerrar panel" : "Abrir panel"}
            title={panelOpen ? "Cerrar panel" : "Abrir panel"}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            {panelOpen ? <RiSidebarFoldLine aria-hidden="true" /> : <RiSidebarUnfoldLine aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <main className="etl-workspace">
        <EstacionesMap city={selectedCity} onCityChange={selectCity} />

        {panelOpen && (
          <aside className="etl-side-panel" aria-label="Panel de trabajo">
            <div className="etl-panel-header">
              <nav className="etl-panel-tabs" aria-label="Vistas del panel">
                {panelTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={panel === id ? "etl-panel-tab is-active" : "etl-panel-tab"}
                    aria-current={panel === id ? "page" : undefined}
                    onClick={() => {
                      setPanel(id)
                      setActiveStage(
                        id === "extraction" ? 0 : id === "pipeline" ? 1 : id === "data" ? 3 : null,
                      )
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
              <AgentDialog compact />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="etl-panel-close"
                aria-label="Cerrar panel"
                title="Cerrar panel"
                onClick={() => setPanelOpen(false)}
              >
                <RiCloseLine aria-hidden="true" />
              </Button>
            </div>
            <div className="etl-side-panel__scroll">
              <AplicacionEtl embedded activePanel={panel} />
            </div>
          </aside>
        )}
      </main>
    </div>
  )
}
