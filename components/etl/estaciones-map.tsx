"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import {
  RiAddLine,
  RiArrowDownSLine,
  RiFocus3Line,
  RiFullscreenLine,
  RiStackLine,
  RiSubtractLine,
  RiWindyLine,
} from "@remixicon/react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { CITIES, type City } from "@/lib/pipeline"

type MapBaseLayer = "datos" | "calles" | "relieve" | "satelite"
type MapMetric = "temperatura" | "humedad" | "lluvia"

const baseLayers: Array<{ id: MapBaseLayer; label: string }> = [
  { id: "datos", label: "Datos" },
  { id: "calles", label: "Calles" },
  { id: "relieve", label: "Relieve" },
  { id: "satelite", label: "Satélite" },
]

function subscribeVisualFilter(callback: () => void) {
  window.addEventListener("etl-visual-filter-change", callback)
  return () => window.removeEventListener("etl-visual-filter-change", callback)
}

function getVisualFilterSnapshot() {
  return document.documentElement.dataset.filtro === "vintage" ? "vintage" : "original"
}

function getServerVisualFilterSnapshot() {
  return "original"
}

function getMapStyle(
  layer: MapBaseLayer,
  dark: boolean,
): string | import("maplibre-gl").StyleSpecification {
  if (layer === "satelite") {
    return {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles © Esri",
        },
      },
      layers: [{ id: "satellite", type: "raster", source: "satellite" }],
    }
  }

  if (layer === "calles") {
    return {
      version: 8,
      sources: {
        streets: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles © Esri",
        },
      },
      layers: [{ id: "streets", type: "raster", source: "streets" }],
    }
  }

  if (layer === "relieve") {
    return {
      version: 8,
      sources: {
        relief: {
          type: "raster",
          tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap",
        },
      },
      layers: [{ id: "relief", type: "raster", source: "relief" }],
    }
  }

  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-brightness-min": dark ? 0.05 : 0,
          "raster-brightness-max": dark ? 0.5 : 1,
          "raster-saturation": dark ? -0.6 : 0,
        },
      },
    ],
  }
}

export function EstacionesMap({
  city,
  onCityChange,
}: {
  city: City
  onCityChange: (city: City) => void
}) {
  const { resolvedTheme } = useTheme()
  const [mapError, setMapError] = useState("")
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>("datos")
  const [metric, setMetric] = useState<MapMetric>("temperatura")
  const [layersOpen, setLayersOpen] = useState(false)
  const [windEnabled, setWindEnabled] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("maplibre-gl").Map | null>(null)
  const markersRef = useRef(new Map<City, HTMLButtonElement>())
  const cityRef = useRef(city)
  const isDark = resolvedTheme === "dark"
  const mapStyleRef = useRef(getMapStyle(baseLayer, isDark))
  const mapStyleKeyRef = useRef(`${baseLayer}:${isDark}`)
  const visualFilter = useSyncExternalStore(
    subscribeVisualFilter,
    getVisualFilterSnapshot,
    getServerVisualFilterSnapshot,
  )

  useEffect(() => {
    cityRef.current = city
    for (const [name, marker] of markersRef.current) {
      marker.setAttribute("aria-pressed", String(name === city))
    }

    const station = CITIES.find((item) => item.name === city)
    if (station) {
      mapRef.current?.flyTo({
        center: [station.longitude, station.latitude],
        zoom: 6.4,
        speed: 0.8,
      })
    }
  }, [city])

  useEffect(() => {
    let active = true
    let map: import("maplibre-gl").Map | undefined
    const markers = markersRef.current

    async function initialize() {
      if (!containerRef.current) return

      try {
        const mapLibre = await import("maplibre-gl")
        if (!active || !containerRef.current) return
        mapLibre.setWorkerUrl("/maplibre-gl-worker.mjs")

        map = new mapLibre.Map({
          container: containerRef.current,
          style: mapStyleRef.current,
          center: [-3.6, 40.1],
          zoom: 5.2,
          minZoom: 4,
          maxZoom: 15,
          attributionControl: false,
          cooperativeGestures: true,
        })
        mapRef.current = map
        map.addControl(new mapLibre.AttributionControl({ compact: true }), "bottom-right")

        for (const station of CITIES) {
          const marker = document.createElement("button")
          marker.type = "button"
          marker.className = "etl-map-marker"
          marker.setAttribute("aria-label", `Seleccionar ${station.name}`)
          marker.setAttribute("aria-pressed", String(station.name === cityRef.current))
          const dot = document.createElement("span")
          dot.className = "etl-map-marker__dot"
          const label = document.createElement("span")
          label.textContent = station.name
          marker.append(dot, label)
          marker.addEventListener("click", () => onCityChange(station.name))
          markers.set(station.name, marker)

          new mapLibre.Marker({ element: marker, anchor: "center" })
            .setLngLat([station.longitude, station.latitude])
            .addTo(map)
        }

        map.once("load", () => {
          if (!active) return
          setMapError("")
        })

        map.on("error", (event) => {
          if (active && event.error) setMapError("No se pudieron cargar las teselas del mapa.")
        })

        const resizeObserver = new ResizeObserver(() => map?.resize())
        resizeObserver.observe(containerRef.current)
        map.once("remove", () => resizeObserver.disconnect())
      } catch (error) {
        if (active) {
          setMapError(
            error instanceof Error
              ? `No se pudo inicializar el mapa: ${error.message}`
              : "No se pudo inicializar el mapa.",
          )
        }
      }
    }

    void initialize()
    return () => {
      active = false
      markers.clear()
      map?.remove()
      mapRef.current = null
    }
  }, [onCityChange])

  useEffect(() => {
    const styleKey = `${baseLayer}:${isDark}`
    if (styleKey === mapStyleKeyRef.current) return

    mapStyleKeyRef.current = styleKey
    const style = getMapStyle(baseLayer, isDark)
    mapStyleRef.current = style
    setMapError("")
    mapRef.current?.setStyle(style)
  }, [baseLayer, isDark])

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(document.fullscreenElement === sectionRef.current)
    }

    document.addEventListener("fullscreenchange", syncFullscreen)
    return () => document.removeEventListener("fullscreenchange", syncFullscreen)
  }, [])

  function showAllStations() {
    const map = mapRef.current
    if (!map) return

    const longitudes = CITIES.map(({ longitude }) => longitude)
    const latitudes = CITIES.map(({ latitude }) => latitude)
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: 72, maxZoom: 6.2, duration: 700 },
    )
  }

  function toggleVisualFilter(nextFilter: "original" | "vintage") {
    if (nextFilter === "vintage") {
      document.documentElement.dataset.filtro = nextFilter
    } else {
      delete document.documentElement.dataset.filtro
    }

    try {
      localStorage.setItem("filtro-visual", nextFilter)
    } catch (error) {
      console.error("No se pudo guardar el filtro visual.", error)
    }
    window.dispatchEvent(new Event("etl-visual-filter-change"))
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === sectionRef.current) {
        await document.exitFullscreen()
      } else {
        await sectionRef.current?.requestFullscreen()
      }
    } catch (error) {
      setMapError(
        error instanceof Error
          ? `No se pudo cambiar el modo de pantalla completa: ${error.message}`
          : "No se pudo cambiar el modo de pantalla completa.",
      )
    }
  }

  return (
    <section
      ref={sectionRef}
      className={`etl-map${visualFilter === "vintage" ? " is-vintage" : ""}`}
      aria-label="Mapa meteorológico"
    >
      <div ref={containerRef} className="etl-map__canvas" />
      {mapError && (
        <p role="alert" className="etl-map__error">
          {mapError} Comprueba tu conexión a Internet.
        </p>
      )}

      <div className="etl-map-panel">
        <fieldset className="etl-map-metric">
          <legend>Métrica</legend>
          <div className="etl-map-segmented">
            {([
              ["temperatura", "Temperatura"],
              ["humedad", "Humedad"],
              ["lluvia", "Lluvia"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={metric === id}
                onClick={() => setMetric(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="etl-map-hint">Descarga los datos para colorear las ciudades según la métrica.</p>

        <button
          type="button"
          className="etl-map-layers-toggle"
          aria-expanded={layersOpen}
          onClick={() => setLayersOpen((open) => !open)}
        >
          <RiStackLine aria-hidden="true" />
          <span>Capas y aspecto</span>
          <RiArrowDownSLine className={layersOpen ? "is-expanded" : ""} aria-hidden="true" />
        </button>

        {layersOpen && (
          <div className="etl-map-layers">
            <fieldset>
              <legend>Mapa base</legend>
              <div className="etl-map-segmented etl-map-segmented--wrap">
                {baseLayers.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={baseLayer === id}
                    onClick={() => setBaseLayer(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Filtro (toda la página)</legend>
              <div className="etl-map-segmented">
                <button
                  type="button"
                  aria-pressed={visualFilter === "original"}
                  onClick={() => toggleVisualFilter("original")}
                >
                  Original
                </button>
                <button
                  type="button"
                  aria-pressed={visualFilter === "vintage"}
                  onClick={() => toggleVisualFilter("vintage")}
                >
                  Vintage
                </button>
              </div>
            </fieldset>

            <button
              type="button"
              className="etl-map-wind"
              role="switch"
              aria-checked={windEnabled}
              onClick={() => setWindEnabled((enabled) => !enabled)}
            >
              <RiWindyLine aria-hidden="true" />
              <span>Viento ahora</span>
              <span className="etl-map-switch" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="etl-map-controls" aria-label="Controles del mapa">
          <button type="button" aria-label="Acercar" onClick={() => mapRef.current?.zoomIn()}>
            <RiAddLine aria-hidden="true" />
          </button>
          <button type="button" aria-label="Alejar" onClick={() => mapRef.current?.zoomOut()}>
            <RiSubtractLine aria-hidden="true" />
          </button>
          <button type="button" className="etl-map-fit" onClick={showAllStations}>
            <RiFocus3Line aria-hidden="true" />
            <span>Ver todas</span>
          </button>
          <button
            type="button"
            aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            onClick={() => void toggleFullscreen()}
          >
            <RiFullscreenLine aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
