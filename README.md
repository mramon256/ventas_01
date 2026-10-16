# Auditoría de ventas y dashboard

## Pregunta y periodo

¿Qué categorías generan más ingresos entre el 1 y el 7 de octubre de 2026? El proceso relaciona el CSV de ventas con el catálogo de productos mediante `producto_id`. El ingreso de cada operación es `unidades × precio_unitario`, en EUR.

## Campos utilizados

- `ventas_origin.csv`: `venta_id` identifica la operación; `fecha` sitúa la venta en el periodo; `producto_id` permite enlazar con el catálogo; `unidades` y `precio_unitario` permiten calcular el ingreso.
- `productos.json`: `producto_id`, `nombre` y `categoria`. El catálogo proporciona la categoría para agrupar ingresos y el nombre para identificar productos.
- Las salidas añaden los agregados del periodo y el registro de calidad. El dashboard lee `public/datos/ventas.csv`, `public/datos/productos.json` y `salida/calidad.json`.

## Reglas de limpieza

1. Se exige la cabecera esperada y cinco campos por fila.
2. Los campos son obligatorios. Las fechas deben ser días reales entre `2026-10-01` y `2026-10-07`.
3. Las unidades deben ser enteros mayores que cero. El precio debe ser numérico, finito y mayor o igual que cero.
4. Cada `producto_id` de una venta debe existir en el catálogo; el catálogo también debe tener IDs únicos y nombre y categoría.
5. Se conserva la primera fila de cada copia exacta, comparando los cinco campos. Un ID repetido con otros datos se registra como conflicto y se excluye para revisión.
6. Las filas inválidas se excluyen de los cálculos y se registra el motivo. Las fuentes originales se conservan.
7. El importe se acumula en céntimos para evitar errores de redondeo; la salida se expresa en EUR.

## Incidencias y duplicados encontrados

El origen contiene 70 filas de datos. Se conservaron 60 operaciones válidas y se excluyeron 10 filas: 5 copias exactas y 5 incidencias. Se comprueba que `70 = 60 + 5 + 5`.

| Tipo | ID | Fila CSV | Tratamiento |
| --- | --- | ---: | --- |
| Duplicado | V003 | 62 | Copia exacta de la fila 4; se conserva la primera. |
| Duplicado | V011 | 63 | Copia exacta de la fila 12; se conserva la primera. |
| Duplicado | V021 | 64 | Copia exacta de la fila 22; se conserva la primera. |
| Duplicado | V036 | 65 | Copia exacta de la fila 37; se conserva la primera. |
| Duplicado | V049 | 66 | Copia exacta de la fila 50; se conserva la primera. |
| Incidencia | V061 | 67 | `unidades` vacío. |
| Incidencia | V062 | 68 | `precio_unitario` vacío. |
| Incidencia | V063 | 69 | El producto P99 no existe en el catálogo. |
| Incidencia | V064 | 70 | Unidades negativas; deben ser un entero positivo. |
| Incidencia | V065 | 71 | Precio no numérico (`gratis`). |

Los motivos completos están en `salida/calidad.json`, junto con los recuentos, IDs y números de fila.

## Cálculos comprobados

Cálculo manual de las cuatro primeras operaciones, usando una copia de cada ID:

| Venta | Operación | Ingreso |
| --- | ---: | ---: |
| V001 | 1 × 5 € | 5 € |
| V002 | 2 × 2 € | 4 € |
| V003 | 3 × 12 € | 36 € |
| V004 | 4 × 25 € | 100 € |
| **Suma manual** |  | **145 €** |

La suma de V001–V004 en el CSV limpio generado también es **145 €**. En el periodo completo, el proceso calcula 60 operaciones válidas, 150 unidades y **2.343 €** de ingresos.

| Categoría | Ingresos |
| --- | ---: |
| Papelería | 72 € |
| Hogar | 1.088 € |
| Tecnología | 308 € |
| Deporte | 875 € |
| **Suma de categorías** | **2.343 €** |

La suma de las categorías coincide con el total de ingresos. Se ejecutó `node scripts/procesar.mjs` dos veces: ambas ejecuciones produjeron 70 filas de entrada, 60 operaciones válidas, 5 duplicados, 5 incidencias, 150 unidades y 2.343 €; la fecha ISO de generación cambia en cada ejecución, como corresponde.

Se usa una gráfica de barras porque las categorías son grupos distintos: la longitud de las barras, comparada desde una misma base, permite ver con claridad cuál genera más ingresos y cuánto difieren.

## Mecanismo de actualización

1. Mantener intacto `public/datos/ventas_origin.csv` como fuente y añadir allí las nuevas operaciones. Si cambia el catálogo, actualizar también `public/datos/productos.json`.
2. Desde la raíz de `ventas-01`, ejecutar `node scripts/procesar.mjs`.
3. El proceso valida los datos y regenera `public/datos/ventas.csv`, `salida/resumen.json` y `salida/calidad.json`. Si una fila no cumple las reglas, no entra en las métricas y aparece en calidad.
4. Revisar los recuentos y totales generados. Para actualizar el dashboard publicado, incorporar los archivos al repositorio, hacer push y desplegar de nuevo.

El dashboard aún no está publicado, así que la última comprobación de la práctica —abrir la URL pública y confirmar que muestra los datos recientes— queda pendiente hasta que exista una URL.

## Limitaciones

- Los datos son sintéticos y cubren solo siete días; no representan necesariamente ventas reales ni permiten concluir tendencias estacionales.
- El cálculo representa unidades por precio histórico. No modela impuestos, descuentos, costes, devoluciones ni conversión de moneda.
- El lector procesa CSV por líneas y admite comillas y comas escapadas dentro de los campos, pero no campos con saltos de línea. Para CSV arbitrario o de mayor volumen conviene usar un parser dedicado y lectura por partes.
- El proceso se ejecuta localmente por lotes; no hay ingesta continua. La publicación y su comprobación visual están pendientes.