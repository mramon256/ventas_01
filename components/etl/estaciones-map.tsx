"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import { RiAddLine, RiFocus3Line, RiSubtractLine } from "@remixicon/react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"

import { CITIES, type City } from "@/lib/pipeline"

export function EstacionesMap({
  city,
  onCityChange,
}: {
  city: City
  onCityChange: (city: City) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("maplibre-gl").Map | null>(null)
  const markersRef = useRef(new Map<City, HTMLButtonElement>())
  const cityRef = useRef(city)
  const { resolvedTheme } = useTheme()
  const [mapError, setMapError] = useState("")

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
          style: `https://tiles.openfreemap.org/styles/${resolvedTheme === "dark" ? "dark" : "positron"}`,
          center: [-3.6, 40.1],
          zoom: 5.2,
          minZoom: 4,
          maxZoom: 15,
          attributionControl: false,
          cooperativeGestures: true,
        })
        mapRef.current = map
        map.addControl(new mapLibre.NavigationControl({ showCompass: false }), "bottom-right")
        map.addControl(new mapLibre.AttributionControl({ compact: true }), "bottom-right")

        map.once("load", () => {
          if (!active || !map) return

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
  }, [onCityChange, resolvedTheme])

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

  return (
    <section className="etl-map" aria-label="Mapa de estaciones meteorológicas de España">
      <div ref={containerRef} className="etl-map__canvas" />
      {mapError && (
        <p role="alert" className="etl-map__error">
          {mapError} Comprueba tu conexión a Internet.
        </p>
      )}

      <div className="etl-map__legend">
        <span className="etl-map__legend-dot" />
        <span>Estaciones meteorológicas</span>
        <b>{CITIES.length}</b>
      </div>

      <div className="etl-map__controls" aria-label="Controles del mapa">
        <button type="button" aria-label="Acercar mapa" onClick={() => mapRef.current?.zoomIn()}>
          <RiAddLine aria-hidden="true" />
        </button>
        <button type="button" aria-label="Alejar mapa" onClick={() => mapRef.current?.zoomOut()}>
          <RiSubtractLine aria-hidden="true" />
        </button>
        <span />
        <button type="button" aria-label="Ver todas las estaciones" onClick={showAllStations}>
          <RiFocus3Line aria-hidden="true" />
          <span>Ver todas</span>
        </button>
      </div>

      <p className="etl-map__caption">Mapa © OpenFreeMap · Datos cartográficos © OpenStreetMap</p>
    </section>
  )
}
