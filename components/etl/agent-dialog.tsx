"use client"

import { RiRobot2Line } from "@remixicon/react"
import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type AgentApiResponse = {
  reply?: unknown
  error?: unknown
}

export function AgentDialog({ compact = false }: { compact?: boolean }) {
  const promptId = useId()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [reply, setReply] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setReply("")
      setError("")
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setReply("")
    setError("")

    try {
      const response = await fetch("/api/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const payload = (await response.json()) as AgentApiResponse

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `No se pudo activar el agente (${response.status}).`,
        )
      }

      if (typeof payload.reply !== "string" || !payload.reply.trim()) {
        throw new Error("La respuesta del agente no tiene un formato válido.")
      }

      setReply(payload.reply)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo conectar con el agente.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={compact ? "etl-agent-trigger" : "gap-2"}
            aria-label={compact ? "Activar agente" : undefined}
            title={compact ? "Activar agente" : undefined}
          >
            <RiRobot2Line aria-hidden="true" />
            {!compact && "Activar agente"}
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asistente de datos meteorológicos</DialogTitle>
          <DialogDescription>
            Pregunta sobre el proceso ETL, las mediciones meteorológicas o la carga en Supabase.
            La conexión está habilitada solo en desarrollo local hasta añadir autenticación.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void submitPrompt(event)}>
          <label className="grid gap-2 text-sm font-medium" htmlFor={promptId}>
            Tu pregunta
            <textarea
              id={promptId}
              required
              minLength={1}
              maxLength={4_000}
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="¿Qué validaciones se aplican antes de guardar las mediciones?"
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {reply && (
            <section aria-label="Respuesta del agente" className="max-h-64 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {reply}
            </section>
          )}

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={loading}>
                  Cerrar
                </Button>
              }
            />
            <Button type="submit" disabled={loading || !prompt.trim()}>
              {loading ? "Consultando…" : "Enviar pregunta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
