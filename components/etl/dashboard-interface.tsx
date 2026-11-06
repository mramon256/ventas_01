"use client"

import {
  RiDatabase2Line,
  RiDownloadCloud2Line,
  RiFilter3Line,
  RiMoonLine,
  RiExpandRightLine,
  RiSparkling2Line,
  RiSunLine,
  RiShuffleLine,
} from "@remixicon/react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useCallback, useState } from "react"

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

export function DashboardInterface({
  supabaseConfigured,
}: {
  supabaseConfigured: boolean
}) {
  const [panel, setPanel] = useState<DashboardPanel>("extraction")
  const [activeStage, setActiveStage] = useState<number | null>(0)
  const [selectedCity, setSelectedCity] = useState<City>("Madrid")
  const [panelOpen, setPanelOpen] = useState(true)
  const { resolvedTheme, setTheme } = useTheme()
  const selectCity = useCallback((city: City) => setSelectedCity(city), [])

  return (
    <main className="etl-dashboard">
      <header className="etl-topbar">
        <Link href="/" className="etl-brand" aria-label="Meteo ETL, inicio">
          <span className="etl-brand__icon" aria-hidden="true">
            <RiSparkling2Line />
          </span>
          <span>Meteo ETL</span>
        </Link>

        <nav className="etl-stage-nav" aria-label="Etapas del pipeline">
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
                  }}
                  aria-current={active ? "step" : undefined}
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{index + 1}. {stage.label}</strong>
                    <small>{stage.detail}</small>
                  </span>
                </button>
                {index < stages.length - 1 && <span className="etl-stage-arrow" aria-hidden="true">›</span>}
              </div>
            )
          })}
        </nav>

        <div className="etl-topbar__actions">
          <span
            className={supabaseConfigured ? "etl-supabase is-ready" : "etl-supabase"}
            role="status"
          >
            <RiDatabase2Line aria-hidden="true" />
            {supabaseConfigured ? "Supabase · Configurado" : "Supabase · Sin configurar"}
          </span>
          <AgentDialog />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Cambiar tema"
            title="Cambiar tema"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <RiSunLine aria-hidden="true" /> : <RiMoonLine aria-hidden="true" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={panelOpen ? "Ocultar panel" : "Mostrar panel"}
            title={panelOpen ? "Ocultar panel" : "Mostrar panel"}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            <RiExpandRightLine aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className={panelOpen ? "etl-workspace" : "etl-workspace is-map-only"}>
        <div className="etl-map-column">
          <EstacionesMap city={selectedCity} onCityChange={selectCity} />
          <div className="etl-map-station">
            <span className="etl-map-station__dot" />
            <span><small>ESTACIÓN SELECCIONADA</small><strong>{selectedCity}</strong></span>
          </div>
        </div>

        {panelOpen ? (
          <aside className="etl-side-panel" aria-label="Panel ETL">
            <nav className="etl-panel-tabs" aria-label="Vistas del pipeline">
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
            <div className="etl-side-panel__scroll">
              <AplicacionEtl embedded activePanel={panel} />
            </div>
          </aside>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="etl-reopen-panel"
            onClick={() => setPanelOpen(true)}
          >
            <RiExpandRightLine aria-hidden="true" />
            Mostrar panel
          </Button>
        )}
      </div>
    </main>
  )
}
