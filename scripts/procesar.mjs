import { readFile, mkdir, writeFile } from "node:fs/promises";

const raiz = new URL("../", import.meta.url);
const rutaVentasOriginales = new URL("public/datos/ventas_origin.csv", raiz);
const rutaProductos = new URL("public/datos/productos.json", raiz);
const fechaDesde = "2026-10-01";
const fechaHasta = "2026-10-07";
const columnasEsperadas = [
  "venta_id",
  "fecha",
  "producto_id",
  "unidades",
  "precio_unitario",
];

async function leerUtf8(ruta) {
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(ruta));
}

function parseCsvLine(linea) {
  const campos = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];
    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === "," && !entreComillas) {
      campos.push(campo);
      campo = "";
    } else {
      campo += caracter;
    }
  }

  if (entreComillas) throw new Error("CSV con comillas sin cerrar.");
  campos.push(campo);
  return campos;
}

function parsearVentas(texto) {
  const lineas = texto.replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  const columnas = parseCsvLine(lineas.shift() ?? "");
  if (JSON.stringify(columnas) !== JSON.stringify(columnasEsperadas)) {
    throw new Error("La cabecera de ventas_origin.csv no coincide con el esquema esperado.");
  }

  return lineas.map((linea, indice) => {
    const campos = parseCsvLine(linea);
    if (campos.length !== columnas.length) {
      throw new Error(`Fila ${indice + 2}: numero de campos incorrecto.`);
    }
    return Object.fromEntries(columnas.map((columna, i) => [columna, campos[i]]));
  });
}

function fechaRealEnPeriodo(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor &&
    valor >= fechaDesde &&
    valor <= fechaHasta
  );
}

function escaparCsv(valor) {
  return `"${String(valor).replaceAll('"', '""')}"`;
}

const [textoVentas, textoProductos] = await Promise.all([
  leerUtf8(rutaVentasOriginales),
  leerUtf8(rutaProductos),
]);
const ventasEntrada = parsearVentas(textoVentas);
const productos = JSON.parse(textoProductos);
const productosPorId = new Map();

for (const producto of productos) {
  if (!producto.producto_id || !producto.nombre || !producto.categoria) {
    throw new Error("El catalogo contiene un producto con campos obligatorios vacios.");
  }
  if (productosPorId.has(producto.producto_id)) {
    throw new Error(`ID de producto duplicado en el catalogo: ${producto.producto_id}`);
  }
  productosPorId.set(producto.producto_id, producto);
}

const filasExactas = new Map();
const primeraFilaPorId = new Map();
const ventasValidas = [];
const duplicados = [];
const incidencias = [];

for (let indice = 0; indice < ventasEntrada.length; indice += 1) {
  const venta = ventasEntrada[indice];
  const filaCsv = indice + 2;
  const firma = JSON.stringify(columnasEsperadas.map((columna) => venta[columna]));

  if (filasExactas.has(firma)) {
    duplicados.push({
      venta_id: venta.venta_id,
      fila_csv: filaCsv,
      motivo: `Copia exacta de la fila ${filasExactas.get(firma)}.`,
    });
    continue;
  }
  filasExactas.set(firma, filaCsv);

  if (venta.venta_id && primeraFilaPorId.has(venta.venta_id)) {
    incidencias.push({
      venta_id: venta.venta_id,
      fila_csv: filaCsv,
      motivo: `Conflicto: el ID ya aparece con datos distintos en la fila ${primeraFilaPorId.get(venta.venta_id)}.`,
    });
    continue;
  }
  if (venta.venta_id) primeraFilaPorId.set(venta.venta_id, filaCsv);

  const motivos = [];
  for (const columna of columnasEsperadas) {
    if (typeof venta[columna] !== "string" || venta[columna].trim() === "") {
      motivos.push(`El campo ${columna} esta vacio.`);
    }
  }

  if (venta.fecha && !fechaRealEnPeriodo(venta.fecha)) {
    motivos.push("La fecha no es un dia real dentro del periodo del 1 al 7 de octubre de 2026.");
  }
  if (venta.unidades && !/^\d+$/.test(venta.unidades)) {
    motivos.push("Las unidades deben ser un entero mayor que cero.");
  } else if (venta.unidades && Number(venta.unidades) <= 0) {
    motivos.push("Las unidades deben ser un entero mayor que cero.");
  }
  if (venta.precio_unitario) {
    const precio = Number(venta.precio_unitario);
    if (!Number.isFinite(precio) || precio < 0) {
      motivos.push("El precio_unitario debe ser un numero finito mayor o igual que cero.");
    }
  }
  if (venta.producto_id && !productosPorId.has(venta.producto_id)) {
    motivos.push(`El producto_id ${venta.producto_id} no existe en productos.json.`);
  }

  if (motivos.length > 0) {
    incidencias.push({ venta_id: venta.venta_id, fila_csv: filaCsv, motivo: motivos.join(" ") });
    continue;
  }

  ventasValidas.push({
    ...venta,
    unidades_num: Number(venta.unidades),
    precio_num: Number(venta.precio_unitario),
    producto: productosPorId.get(venta.producto_id),
  });
}

const recuentos = {
  filas_entrada: ventasEntrada.length,
  operaciones_validas: ventasValidas.length,
  copias_duplicadas_excluidas: duplicados.length,
  incidencias_excluidas: incidencias.length,
};
if (
  recuentos.filas_entrada !==
  recuentos.operaciones_validas +
    recuentos.copias_duplicadas_excluidas +
    recuentos.incidencias_excluidas
) {
  throw new Error("El control de calidad no clasifica todas las filas exactamente una vez.");
}

let ingresosTotalesCentimos = 0;
let unidadesTotales = 0;
const ingresosPorCategoriaCentimos = new Map();
for (const producto of productos) {
  if (!ingresosPorCategoriaCentimos.has(producto.categoria)) {
    ingresosPorCategoriaCentimos.set(producto.categoria, 0);
  }
}
for (const venta of ventasValidas) {
  const ingresoCentimos = Math.round(venta.unidades_num * venta.precio_num * 100);
  ingresosTotalesCentimos += ingresoCentimos;
  unidadesTotales += venta.unidades_num;
  ingresosPorCategoriaCentimos.set(
    venta.producto.categoria,
    ingresosPorCategoriaCentimos.get(venta.producto.categoria) + ingresoCentimos
  );
}

const ingresosPorCategoria = Array.from(
  ingresosPorCategoriaCentimos,
  ([categoria, centimos]) => ({ categoria, ingresos: centimos / 100 })
);
const sumaCategoriasCentimos = Array.from(ingresosPorCategoriaCentimos.values()).reduce(
  (suma, centimos) => suma + centimos,
  0
);
if (sumaCategoriasCentimos !== ingresosTotalesCentimos) {
  throw new Error("La suma de ingresos por categoria no coincide con los ingresos totales.");
}

const resumen = {
  periodo: { desde: fechaDesde, hasta: fechaHasta },
  moneda: "EUR",
  generado_en: new Date().toISOString(),
  operaciones_validas: ventasValidas.length,
  unidades_totales: unidadesTotales,
  ingresos_totales: ingresosTotalesCentimos / 100,
  ingresos_por_categoria: ingresosPorCategoria,
};
const calidad = {
  recuentos,
  duplicados,
  incidencias,
};
const csvLimpio = [
  columnasEsperadas.map(escaparCsv).join(","),
  ...ventasValidas.map((venta) => columnasEsperadas.map((columna) => escaparCsv(venta[columna])).join(",")),
].join("\n") + "\n";

await mkdir(new URL("salida/", raiz), { recursive: true });
await writeFile(new URL("salida/resumen.json", raiz), JSON.stringify(resumen, null, 2) + "\n", "utf8");
await writeFile(new URL("salida/calidad.json", raiz), JSON.stringify(calidad, null, 2) + "\n", "utf8");
await writeFile(new URL("public/datos/ventas.csv", raiz), csvLimpio, "utf8");

console.log(`Filas de entrada: ${recuentos.filas_entrada}`);
console.log(`Operaciones validas: ${recuentos.operaciones_validas}`);
console.log(`Copias exactas excluidas: ${recuentos.copias_duplicadas_excluidas}`);
console.log(`Incidencias excluidas: ${recuentos.incidencias_excluidas}`);
console.log(`Ingresos totales: ${(ingresosTotalesCentimos / 100).toFixed(2)} EUR`);
console.log(`Archivos actualizados: salida/resumen.json, salida/calidad.json y public/datos/ventas.csv`);