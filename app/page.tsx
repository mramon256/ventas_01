import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
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

async function obtenerVentas(): Promise<Venta[]> {
  const csv = await readFile(join(process.cwd(), "public", "data", "ventas.csv"), "utf8")
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)

  return dataLines.map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index]])) as Venta
  })
}

export default async function Page() {
  const ventas = await obtenerVentas()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Actividad de ventas</p>
        <h1 className="text-3xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-muted-foreground">
          Registros cargados desde el archivo public/data/ventas.csv.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-2 shadow-sm sm:p-4">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableCaption>{`${ventas.length} operaciones cargadas desde el CSV.`}</TableCaption>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Venta ID</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto ID</TableHead>
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
                  <TableCell className="text-right">{venta.unidades}</TableCell>
                  <TableCell className="text-right">
                    {Number(venta.precio_unitario).toLocaleString("es-ES", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(Number(venta.unidades) * Number(venta.precio_unitario)).toLocaleString(
                      "es-ES",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  )
}
