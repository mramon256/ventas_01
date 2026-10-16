import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const raiz = new URL('../', import.meta.url);
const texto = await readFile(new URL('public/datos/ventas.csv', raiz), 'utf8');
const productos = JSON.parse(await readFile(new URL('public/datos/productos.json', raiz), 'utf8'));

// Lector válido SOLO para el CSV controlado de esta práctica:
// separador coma, sin campos entrecomillados, comas internas ni saltos en campos.
// En un proyecto con CSV arbitrarios, usa un parser que soporte esas características.
const lineas = texto.trim().split(/\r?\n/);
const columnas = lineas.shift().split(',');
const ventas = lineas.map((linea, indice) => {
  const campos = linea.split(',');
  if (campos.length !== columnas.length) throw new Error(`Fila ${indice + 2}: número de campos incorrecto`);
  return Object.fromEntries(columnas.map((columna, i) => [columna, campos[i]]));
});

console.log(`Entrada: ${ventas.length} filas de ventas y ${productos.length} productos.`);
console.log('Los números del CSV todavía son cadenas. Revisa vacíos ANTES de convertir.');

// TODO 1: construir un índice por producto_id y comprobar que el catálogo tiene IDs únicos.
// TODO 2: recorrer ventas y detectar copias exactas de una operación ya vista.
// TODO 3: validar campos, fecha, unidades, precio y referencia al catálogo.
// TODO 4: separar incidencias con venta_id, fila del CSV y motivo.
// TODO 5: enriquecer cada venta válida con nombre, categoría e ingreso.
// TODO 6: calcular totales y agrupar ingresos por categoría.
// TODO 7: crear el objeto resultado descrito en el enunciado y llamar a guardarResultado.
// TODO 8: crear el informe de calidad y llamar a guardarCalidad.

async function guardarResultado(resultado) {
  await mkdir(new URL('salida/', raiz), { recursive: true });
  await writeFile(new URL('salida/resumen.json', raiz), JSON.stringify(resultado, null, 2) + '\n');
}

async function guardarCalidad(informe) {
  await mkdir(new URL('salida/', raiz), { recursive: true });
  await writeFile(new URL('salida/calidad.json', raiz), JSON.stringify(informe, null, 2) + '\n');
}

console.log('Script inicial ejecutado. Completa los TODO: todavía no genera métricas ni archivos de salida.');
console.log(`Carpeta de trabajo: ${fileURLToPath(raiz)}`);
