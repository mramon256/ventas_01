"use client"

import { Monitor } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  desktop: {
    label: "Unidades vendidas",
    icon: Monitor,
    theme: {
      light: "#60a5fa",
      dark: "#60a5fa",
    },
  },
} satisfies ChartConfig

type DatoProducto = {
  producto: string
  desktop: number
}

export function VentasChart({ data }: { data: DatoProducto[] }) {
  return (
    <ChartContainer
      config={chartConfig}
      className="h-[260px] w-full"
      initialDimension={{ width: 360, height: 260 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 0, right: 8 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis dataKey="desktop" type="number" hide />
        <YAxis
          dataKey="producto"
          type="category"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={110}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

type DatoFecha = {
  fecha: string
  ingresos: number
}

const ingresosChartConfig = {
  ingresos: {
    label: "Importe vendido",
    icon: Monitor,
    theme: {
      light: "#60a5fa",
      dark: "#60a5fa",
    },
  },
} satisfies ChartConfig

export function IngresosPorFechaChart({ data }: { data: DatoFecha[] }) {
  return (
    <ChartContainer
      config={ingresosChartConfig}
      className="h-[280px] w-full"
      initialDimension={{ width: 420, height: 280 }}
    >
      <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="fecha"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: number) =>
            value.toLocaleString("es-ES", { notation: "compact", maximumFractionDigits: 0 })
          }
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Fecha: ${label}`}
              formatter={(value) =>
                `${Number(value).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} \u20ac`
              }
            />
          }
        />
        <Bar dataKey="ingresos" fill="var(--color-ingresos)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}