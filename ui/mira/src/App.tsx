import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { DashboardLayout } from "@/components/dashboard/layout"
import { SetupModal } from "@/components/dashboard/setup-modal"
import { UninstallModal } from "@/components/dashboard/uninstall-modal"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
// Eager: these are the entry surfaces (unauthenticated login + first-run
// setup), so they must render without a round-trip to fetch a chunk.
import { LoginPage } from "@/pages/login"
import { SetupPage } from "@/pages/setup"

// Lazy: every auth-gated route. Each becomes its own chunk, fetched on first
// navigation, instead of one 1.2MB bundle on initial load.
const DashboardPage = lazy(() =>
  import("@/pages/dashboard").then((m) => ({ default: m.DashboardPage })),
)
const ActivityPage = lazy(() =>
  import("@/pages/activity").then((m) => ({ default: m.ActivityPage })),
)
const ReposPage = lazy(() =>
  import("@/pages/repos").then((m) => ({ default: m.ReposPage })),
)
const RepoDetailPage = lazy(() =>
  import("@/pages/repo-detail").then((m) => ({ default: m.RepoDetailPage })),
)
const PackagesPage = lazy(() =>
  import("@/pages/packages").then((m) => ({ default: m.PackagesPage })),
)
const RelationshipsPage = lazy(() =>
  import("@/pages/relationships").then((m) => ({ default: m.RelationshipsPage })),
)
const RulesPage = lazy(() =>
  import("@/pages/rules").then((m) => ({ default: m.RulesPage })),
)
const LearnedRulesPage = lazy(() =>
  import("@/pages/learned-rules").then((m) => ({ default: m.LearnedRulesPage })),
)
const VulnerabilitiesPage = lazy(() =>
  import("@/pages/vulnerabilities").then((m) => ({ default: m.VulnerabilitiesPage })),
)
const UsersPage = lazy(() =>
  import("@/pages/users").then((m) => ({ default: m.UsersPage })),
)
const UserFormPage = lazy(() =>
  import("@/pages/user-form").then((m) => ({ default: m.UserFormPage })),
)
const ResetUserPasswordPage = lazy(() =>
  import("@/pages/reset-user-password").then((m) => ({
    default: m.ResetUserPasswordPage,
  })),
)
const ChangePasswordPage = lazy(() =>
  import("@/pages/change-password").then((m) => ({ default: m.ChangePasswordPage })),
)
const WebhooksPage = lazy(() =>
  import("@/pages/webhooks").then((m) => ({ default: m.WebhooksPage })),
)
const WebhookFormPage = lazy(() =>
  import("@/pages/webhook-form").then((m) => ({ default: m.WebhookFormPage })),
)
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.SettingsPage })),
)

const API_BASE = import.meta.env.VITE_API_URL || ""

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/** Shown while a lazy route chunk is being fetched on first navigation. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  )
}

function SetupGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    if (!user?.is_admin) {
      setChecking(false)
      return
    }
    api
      .getSetupStatus()
      .then((s) => setNeedsSetup(!s.setup_complete))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [user])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />
  }

  return <>{children}</>
}

function AppShell() {
  const { user } = useAuth()
  const [showInstallPopup, setShowInstallPopup] = useState(false)
  const [pendingUninstall, setPendingUninstall] = useState<{
    installation_id: number
    owner: string
  } | null>(null)

  // Check initial state + subscribe to SSE
  useEffect(() => {
    if (!user?.is_admin) return

    let eventSource: EventSource | null = null
    let cancelled = false

    const checkInitial = async () => {
      try {
        // Sync DB with GitHub installations (catches missed webhooks)
        await api.syncRepos().catch(() => {})

        if (cancelled) return

        // Show install popup if there are pending repos that haven't been
        // explicitly skipped. `Skip for now` sets index_mode='none' but leaves
        // status='pending' — without the second clause the modal would re-fire
        // on every reload.
        const repos = await api.listRepos()
        if (
          !cancelled &&
          repos.some((r) => r.status === "pending" && r.index_mode !== "none")
        ) {
          setShowInstallPopup(true)
        }

        // Show uninstall popup if any pending uninstalls
        const uninstalls = await api.listPendingUninstalls()
        if (!cancelled && uninstalls.length > 0) {
          setPendingUninstall(uninstalls[0])
        }
      } catch {
        // ignore
      }
    }

    checkInitial()

    // Subscribe to SSE for real-time events
    eventSource = new EventSource(`${API_BASE}/api/events`, {
      withCredentials: true,
    })

    eventSource.addEventListener("install_created", () => {
      setShowInstallPopup(true)
    })

    eventSource.addEventListener("repos_added", () => {
      setShowInstallPopup(true)
    })

    eventSource.addEventListener("uninstall_pending", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setPendingUninstall({
          installation_id: data.installation_id,
          owner: data.owner,
        })
      } catch {
        // ignore
      }
    })

    return () => {
      cancelled = true
      eventSource?.close()
    }
  }, [user])

  return (
    <>
      {/* Uninstall popup takes priority */}
      {pendingUninstall && (
        <UninstallModal
          installationId={pendingUninstall.installation_id}
          owner={pendingUninstall.owner}
          onDone={() => setPendingUninstall(null)}
        />
      )}
      <SetupModal
        open={showInstallPopup && !pendingUninstall}
        onComplete={() => setShowInstallPopup(false)}
      />
      <DashboardLayout />
    </>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <SetupPage />
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <SetupGuard>
                <AppShell />
              </SetupGuard>
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="activity"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ActivityPage />
              </Suspense>
            }
          />
          <Route
            path="repos"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ReposPage />
              </Suspense>
            }
          />
          <Route
            path="repos/:owner/:repo"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RepoDetailPage />
              </Suspense>
            }
          />
          <Route
            path="packages"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PackagesPage />
              </Suspense>
            }
          />
          <Route
            path="relationships"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RelationshipsPage />
              </Suspense>
            }
          />
          <Route
            path="rules"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RulesPage />
              </Suspense>
            }
          />
          <Route
            path="learnings"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LearnedRulesPage />
              </Suspense>
            }
          />
          <Route
            path="vulnerabilities"
            element={
              <Suspense fallback={<RouteFallback />}>
                <VulnerabilitiesPage />
              </Suspense>
            }
          />
          <Route
            path="users"
            element={
              <Suspense fallback={<RouteFallback />}>
                <UsersPage />
              </Suspense>
            }
          />
          <Route
            path="users/new"
            element={
              <Suspense fallback={<RouteFallback />}>
                <UserFormPage />
              </Suspense>
            }
          />
          <Route
            path="users/:id/password"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ResetUserPasswordPage />
              </Suspense>
            }
          />
          <Route
            path="account/password"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ChangePasswordPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={<Navigate to="/settings/models" replace />}
          />
          <Route
            path="settings/webhooks"
            element={
              <Suspense fallback={<RouteFallback />}>
                <WebhooksPage />
              </Suspense>
            }
          />
          <Route
            path="settings/webhooks/new"
            element={
              <Suspense fallback={<RouteFallback />}>
                <WebhookFormPage />
              </Suspense>
            }
          />
          <Route
            path="settings/webhooks/:id"
            element={
              <Suspense fallback={<RouteFallback />}>
                <WebhookFormPage />
              </Suspense>
            }
          />
          <Route
            path="settings/:section"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
