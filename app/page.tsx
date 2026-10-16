import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { IngresosPorFechaChart, VentasChart } from "@/components/ventas-chart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Venta = {
  venta_id: string
  fecha: string
  producto_id: string
  unidades: string
  precio_unitario: string
}

type Producto = {
  producto_id: string
  nombre: string
  categoria: string
}

type Calidad = {
  recuentos: {
    copias_duplicadas_excluidas: number
    incidencias_excluidas: number
  }
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      fields.push(field)
      field = ""
    } else {
      field += character
    }
  }

  fields.push(field)
  return fields
}

async function leerTextoUtf8(path: string): Promise<string> {
  const bytes = await readFile(path)
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}

async function obtenerVentas(): Promise<Venta[]> {
  const csv = await leerTextoUtf8(join(process.cwd(), "public", "data", "ventas.csv"))
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)

  return dataLines.map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index]])) as Venta
  })
}

async function obtenerProductos(): Promise<Producto[]> {
  const json = await leerTextoUtf8(join(process.cwd(), "public", "data", "productos.json"))
  return JSON.parse(json) as Producto[]
}

async function obtenerCalidad(): Promise<Calidad> {
  const json = await leerTextoUtf8(join(process.cwd(), "salida", "calidad.json"))
  return JSON.parse(json) as Calidad
}

export default async function Page() {
  const [ventas, productos, calidad] = await Promise.all([
    obtenerVentas(),
    obtenerProductos(),
    obtenerCalidad(),
  ])
  const productosPorId = new Map(
    productos.map((producto) => [producto.producto_id, producto] as const)
  )
  const ingresosPorCategoria = new Map<string, number>()
  for (const producto of productos) {
    if (!ingresosPorCategoria.has(producto.categoria)) {
      ingresosPorCategoria.set(producto.categoria, 0)
    }
  }
  for (const venta of ventas) {
    const categoria = productosPorId.get(venta.producto_id)?.categoria
    if (!categoria) continue
    const ingreso = Number(venta.unidades) * Number(venta.precio_unitario)
    ingresosPorCategoria.set(categoria, (ingresosPorCategoria.get(categoria) ?? 0) + ingreso)
  }
  const resumenIngresosPorCategoria = Array.from(
    ingresosPorCategoria,
    ([categoria, ingresos]) => ({ categoria, ingresos })
  ).sort((a, b) => a.categoria.localeCompare(b.categoria, "es"))
  const totalVentas = ventas.reduce(
    (suma, venta) => suma + Number(venta.unidades) * Number(venta.precio_unitario),
    0
  )
  const totalUnidades = ventas.reduce(
    (suma, venta) => suma + Number(venta.unidades),
    0
  )
  const ventaMedia = ventas.length > 0 ? totalVentas / ventas.length : 0
  const unidadesPorProducto = ventas.reduce((acumulado, venta) => {
    acumulado.set(
      venta.producto_id,
      (acumulado.get(venta.producto_id) ?? 0) + Number(venta.unidades)
    )
    return acumulado
  }, new Map<string, number>())
  const productoMasVendido = productos.reduce<Producto | undefined>(
    (mejor, producto) =>
      !mejor ||
      (unidadesPorProducto.get(producto.producto_id) ?? 0) >
        (unidadesPorProducto.get(mejor.producto_id) ?? 0)
        ? producto
        : mejor,
    undefined
  )
  const unidadesDelMasVendido = productoMasVendido
    ? (unidadesPorProducto.get(productoMasVendido.producto_id) ?? 0)
    : 0
  const datosGrafico = productos
    .map((producto) => ({
      producto: producto.nombre,
      desktop: unidadesPorProducto.get(producto.producto_id) ?? 0,
    }))
    .sort((a, b) => a.desktop - b.desktop || a.producto.localeCompare(b.producto))
  const ingresosPorFecha = ventas.reduce((acumulado, venta) => {
    const importe = Number(venta.unidades) * Number(venta.precio_unitario)
    acumulado.set(venta.fecha, (acumulado.get(venta.fecha) ?? 0) + importe)
    return acumulado
  }, new Map<string, number>())
  const datosIngresosPorFecha = Array.from(ingresosPorFecha, ([fecha, ingresos]) => ({
    fecha,
    ingresos,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha))

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Actividad de ventas</p>
        <h1 className="text-3xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-muted-foreground">
          Registros cargados desde el archivo public/data/ventas.csv.
        </p>
      </header>

      <div className="columns-1 gap-4 md:columns-2 xl:grid xl:grid-cols-12">
        <Card className="mb-4 inline-block w-full break-inside-avoid xl:col-span-4 xl:mb-0">
          <CardHeader>
            <CardDescription>Ingresos totales</CardDescription>
            <CardTitle className="text-3xl">
              {totalVentas.toLocaleString("es-ES", {
                minimumFractionDigits: 2,
                useGrouping: true,
                maximumFractionDigits: 2,
              })}{" \u20ac"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Suma de unidades por precio unitario en cada venta.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4 inline-block w-full break-inside-avoid xl:col-span-4 xl:col-start-5 xl:mb-0">
          <CardHeader>
            <CardDescription>Venta media</CardDescription>
            <CardTitle className="text-3xl">
              {ventaMedia.toLocaleString("es-ES", {
                minimumFractionDigits: 2,
                useGrouping: true,
                maximumFractionDigits: 2,
              })}{" \u20ac"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ingresos totales divididos entre operaciones.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4 inline-block w-full break-inside-avoid xl:col-span-4 xl:col-start-1 xl:mb-0">
          <CardHeader>
            <CardDescription>Registros excluidos</CardDescription>
            <CardTitle>Calidad de los datos</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Duplicados</p>
              <p className="text-2xl font-semibold">
                {calidad.recuentos.copias_duplicadas_excluidas.toLocaleString("es-ES")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Incidencias</p>
              <p className="text-2xl font-semibold">
                {calidad.recuentos.incidencias_excluidas.toLocaleString("es-ES")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="mb-4 inline-block w-full break-inside-avoid xl:col-span-4 xl:col-start-9 xl:mb-0">
          <CardHeader>
            <CardDescription>{"Producto m\u00e1s vendido"}</CardDescription>
            <CardTitle className="text-lg break-words">
              {productoMasVendido?.nombre ?? "Sin datos"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              ID: {productoMasVendido?.producto_id ?? "Sin ID"}
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {unidadesDelMasVendido.toLocaleString("es-ES", { useGrouping: true })} unidades
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-6 xl:col-span-4 xl:col-start-3">
          <CardHeader>
            <CardTitle>Unidades por producto</CardTitle>
            <CardDescription>Productos ordenados por unidades vendidas, de menor a mayor.</CardDescription>
          </CardHeader>
          <CardContent>
            <VentasChart data={datosGrafico} />
          </CardContent>
        </Card>
        <Card className="col-span-12 lg:col-span-6 xl:col-span-4 xl:col-start-7">
          <CardHeader>
            <CardTitle>Importe vendido por fecha</CardTitle>
            <CardDescription>Ingresos diarios calculados como unidades por precio unitario.</CardDescription>
          </CardHeader>
          <CardContent>
            <IngresosPorFechaChart data={datosIngresosPorFecha} />
          </CardContent>
        </Card>
      </section>

      <section className="rounded-xl border bg-card p-2 shadow-sm sm:p-4">
        <Table>
          <TableCaption>{"Ingresos acumulados por categor\u00eda del producto."}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{"Categor\u00eda"}</TableHead>
              <TableHead className="text-right">{"Ingresos acumulados (\u20ac)"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumenIngresosPorCategoria.map(({ categoria, ingresos }) => (
              <TableRow key={categoria}>
                <TableCell className="font-medium">{categoria}</TableCell>
                <TableCell className="text-right">
                  {ingresos.toLocaleString("es-ES", {
                    minimumFractionDigits: 2,
                    useGrouping: true,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="text-right font-semibold">Total general</TableCell>
              <TableCell className="text-right font-bold">
                {totalVentas.toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                  useGrouping: true,
                  maximumFractionDigits: 2,
                })}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </section>
      <section className="rounded-xl border bg-card p-2 shadow-sm sm:p-4">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableCaption>{`${ventas.length} operaciones cargadas desde el CSV.`}</TableCaption>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Venta ID</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto ID</TableHead>
                <TableHead>{"Categor\u00eda"}</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">{"Precio unitario (\u20ac)"}</TableHead>
                <TableHead className="text-right">{"Total (\u20ac)"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.map((venta) => (
                <TableRow key={venta.venta_id}>
                  <TableCell className="font-medium">{venta.venta_id}</TableCell>
                  <TableCell>{venta.fecha}</TableCell>
                  <TableCell>{venta.producto_id}</TableCell>
                  <TableCell>{productosPorId.get(venta.producto_id)?.categoria ?? "-"}</TableCell>
                  <TableCell className="text-right">{venta.unidades}</TableCell>
                  <TableCell className="text-right">
                    {Number(venta.precio_unitario).toLocaleString("es-ES", {
                      minimumFractionDigits: 2,
                      useGrouping: true,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(Number(venta.unidades) * Number(venta.precio_unitario)).toLocaleString(
                      "es-ES",
                      {
                        minimumFractionDigits: 2,
                        useGrouping: true,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-semibold">
                  Total de ventas
                </TableCell>
                <TableCell className="text-right font-bold">
                  {totalUnidades.toLocaleString("es-ES", { useGrouping: true })}
                </TableCell>
                <TableCell className="text-right font-semibold">Importe total</TableCell>
                <TableCell className="text-right font-bold">
                  {totalVentas.toLocaleString("es-ES", {
                    minimumFractionDigits: 2,
                    useGrouping: true,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>
    </main>
  )
}
