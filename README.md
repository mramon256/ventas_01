# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

Supabase


## Práctica ETL meteorológica

Aplicación didáctica para extraer observaciones horarias del [Archivo Histórico de Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api), normalizarlas y validarlas antes de seleccionar filas para Supabase.

La página de inicio muestra el dashboard de estaciones con mapa interactivo, navegación entre etapas y el panel ETL existente. El mapa usa teselas de OpenFreeMap/OpenStreetMap y necesita conexión a Internet; el worker de MapLibre y su licencia se copian automáticamente a `public/` al ejecutar `npm run dev` o `npm run build`.

### Instalación y ejecución

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env.local` y completa `SUPABASE_URL` y `SUPABASE_SECRET_KEY`. La clave secreta nunca debe llevar prefijo `NEXT_PUBLIC_`. La URL pública puede coincidir con `NEXT_PUBLIC_SUPABASE_URL`.
3. Ejecuta la migración `supabase/migrations/202610230001_mediciones_meteorologicas.sql` en el SQL Editor de Supabase.
4. Arranca el entorno con `npm run dev` y abre `http://localhost:3000`.

La publishable key no se usa en esta aplicación: lectura y escritura pasan por rutas de servidor y requieren la clave secreta. No hay autenticación en el proyecto; estas rutas están pensadas solo para desarrollo local. Añade autenticación y autorización antes de publicar. RLS queda activado, sin políticas públicas de escritura.

El botón «Activar agente» abre un diálogo y envía la pregunta a una API compatible con OpenAI. Configura `AGENT_API_URL` (URL completa del endpoint Chat Completions), `AGENT_API_KEY` y `AGENT_MODEL` en `.env.local`; en Vercel no habilites el endpoint hasta añadir autenticación y autorización de usuario. La clave permanece en el servidor y nunca se envía al navegador.

### Etapas y reglas

La interfaz conserva el JSON de cada ciudad durante la sesión, transforma arrays paralelos a registros por hora UTC, rechaza mediciones nulas o inválidas y deduplica por `(ciudad, fecha_hora)` conservando la primera fila válida. Los filtros se aplican antes de ordenar y seleccionar; la paginación solo limita lo que se muestra. La selección automática incluye todas las filas filtradas y se recalcula al cambiar los filtros; al editarla manualmente, los cambios de filtros no añaden filas. La vista previa refleja exactamente los seleccionados que siguen cumpliendo los filtros. La carga congela ese conjunto, usa upsert en lotes de hasta 500 y verifica las claves en destino. La consulta posterior debe declarar `ORDER BY`: la base de datos no garantiza el orden de inserción.

Las variables de la tabla son `temperatura_c` (°C), `humedad_pct` (%) y `precipitacion_mm` (mm). `.env.local` está excluido de Git.
