export const SCRIPT_FILTRO = `try {
  const filtro = localStorage.getItem("filtro-visual")
  if (filtro === "vintage") document.documentElement.dataset.filtro = filtro
} catch (error) {
  console.error("No se pudo restaurar el filtro visual.", error)
}`
