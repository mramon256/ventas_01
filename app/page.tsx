import { DashboardInterface } from "@/components/etl/dashboard-interface"

export default function Page() {
  const supabaseConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SECRET_KEY,
  )

  return <DashboardInterface supabaseConfigured={supabaseConfigured} />
}
