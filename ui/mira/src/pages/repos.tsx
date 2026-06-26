import { Loader2, Plus, Search, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { api, type RepoListItem } from "@/lib/api"
import { useDocumentTitle } from "@/lib/hooks"

export function ReposPage() {
  useDocumentTitle("Repositories")
  const [repos, setRepos] = useState<RepoListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  // Seed the filter from `?owner=` so breadcrumb links can pre-filter the list.
  const [search, setSearch] = useState(searchParams.get("owner") ?? "")

  // Add-repo dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [addValue, setAddValue] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Initial load + poll while any repo is indexing
  useEffect(() => {
    const load = () => {
      api.listRepos().then(setRepos).finally(() => setLoading(false))
    }
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const hasIndexing = repos.some((r) => r.status === "indexing")

  const filtered = repos.filter(
    (r) =>
      r.owner.toLowerCase().includes(search.toLowerCase()) ||
      r.repo.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleAddRepo() {
    setAdding(true)
    setAddError(null)
    try {
      const created = await api.addRepo(addValue)
      setRepos((prev) => {
        const exists = prev.some(
          (r) => r.owner === created.owner && r.repo === created.repo,
        )
        return exists
          ? prev.map((r) =>
              r.owner === created.owner && r.repo === created.repo ? created : r,
            )
          : [created, ...prev]
      })
      toast.success("Repository added", {
        description: `${created.owner}/${created.repo} is ready to index.`,
      })
      setAddValue("")
      setAddOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAddError(msg)
      toast.error("Could not add repository", { description: msg })
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveRepo(owner: string, repo: string) {
    try {
      await api.removeRepo(owner, repo)
      setRepos((prev) =>
        prev.filter((r) => !(r.owner === owner && r.repo === repo)),
      )
      toast.success("Repository removed", {
        description: `${owner}/${repo} was unregistered.`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error("Could not remove repository", { description: msg })
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground">
            All repositories and their indexing status
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Repo
        </Button>
      </div>

      {/* Indexing banner */}
      {hasIndexing && (
        <Card className="relative overflow-hidden border-primary/30 bg-primary/5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent [background-size:200%_100%] [animation:shimmer_2s_linear_infinite]" />
          <CardContent className="flex items-center gap-4 p-4">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute inset-1 rounded-full border-2 border-primary/40 border-t-primary [animation:spin_1s_linear_infinite]" />
            </div>
            <p className="text-sm font-medium">Indexing in progress...</p>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              `${filtered.length} repositories`
            )}
          </CardTitle>
          <CardDescription>Click a repository to view details</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="ml-4 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="ml-auto h-5 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="space-y-4">
              {filtered.map((r) => {
                const key = `${r.owner}/${r.repo}`
                const initials = r.repo
                  .split("-")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)

                return (
                  <div key={key} className="group flex items-center">
                    <Link
                      to={`/repos/${r.owner}/${r.repo}`}
                      className="flex flex-1 items-center"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="ml-4 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {r.repo}
                        </p>
                        <p className="text-sm text-muted-foreground">{r.owner}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-2 pr-2">
                        <StatusBadge status={r.status} error={r.error} />
                        {r.status === "ready" && (
                          <span className="text-sm font-medium">
                            {r.file_count} files
                          </span>
                        )}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      title={`Remove ${r.owner}/${r.repo}`}
                      onClick={() => handleRemoveRepo(r.owner, r.repo)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No repositories yet</p>
                <p className="text-sm text-muted-foreground">
                  Add a GitHub repo to start indexing and reviewing.
                </p>
              </div>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add your first repo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Repo dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              Register a GitHub repo manually. No GitHub App installation
              required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              placeholder="owner/repo  or  https://github.com/owner/repo"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addValue.trim() && !adding) {
                  handleAddRepo()
                }
              }}
              autoFocus
            />
            {addError && (
              <p className="text-sm text-destructive">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddRepo}
              disabled={!addValue.trim() || adding}
            >
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status, error }: { status: string; error?: string }) {
  switch (status) {
    case "indexing":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Indexing
        </Badge>
      )
    case "ready":
      return null
    case "failed":
      return (
        <Badge variant="destructive" title={error}>
          Failed
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Pending
        </Badge>
      )
  }
}
