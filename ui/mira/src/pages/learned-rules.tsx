import { Brain, RefreshCw, Sparkles } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type OrgLearnedRuleModel } from "@/lib/api"
import { useAsync, useDocumentTitle } from "@/lib/hooks"

const SIGNAL_LABEL: Record<string, string> = {
  reject_pattern: "Rejected pattern",
  accept_pattern: "Accepted pattern",
  human_pattern: "Human reviewer style",
}

const SIGNAL_STYLE: Record<string, string> = {
  reject_pattern: "text-red-300 border-red-500/40 bg-red-500/10",
  accept_pattern: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  human_pattern: "text-violet-300 border-violet-500/40 bg-violet-500/10",
}

export function LearnedRulesPage() {
  useDocumentTitle("Learnings")
  const {
    data: rules,
    loading,
    error: rulesError,
    refetch: refetchRules,
  } = useAsync(() => api.listLearnedRules(), [])
  const { data: version } = useAsync(
    () => api.getVersion().catch(() => null),
    [],
  )
  const botName = version?.bot_name ?? "miracodeai"

  // Group by (owner/repo) so the page reads "what Mira learned about each repo"
  const grouped = useMemo(() => {
    const map = new Map<string, OrgLearnedRuleModel[]>()
    for (const r of rules ?? []) {
      const key = `${r.owner}/${r.repo}`
      const list = map.get(key)
      if (list) list.push(r)
      else map.set(key, [r])
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [rules])

  const totalRules = rules?.length ?? 0
  const reposWithRules = grouped.length

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learnings</h1>
        <p className="text-sm text-muted-foreground">
          What Mira has learned from your team's PR feedback. These inject into
          every review automatically — no configuration needed.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 2 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 w-full rounded-lg" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rulesError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Brain className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Couldn't load learnings</p>
              <p className="max-w-md text-sm text-muted-foreground">{rulesError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={refetchRules}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : totalRules === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <Brain className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No learnings yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Mira learns from <code className="font-mono">@{botName} reject</code>{" "}
              dismissals and from human review comments on merged PRs. Reach
              ~3 reject signals or merge a PR with substantive review comments to
              see synthesized patterns appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold tabular-nums">{totalRules}</span>
              <span className="text-muted-foreground">
                rule{totalRules !== 1 ? "s" : ""} across {reposWithRules}{" "}
                repo{reposWithRules !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {grouped.map(([repoKey, repoRules]) => {
              const [owner, repo] = repoKey.split("/")
              return (
                <Card key={repoKey}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        <Link
                          to={`/repos/${owner}/${repo}`}
                          className="font-mono hover:underline"
                        >
                          {repoKey}
                        </Link>
                      </CardTitle>
                      <Badge variant="secondary" className="tabular-nums">
                        {repoRules.length}
                      </Badge>
                    </div>
                    <CardDescription>
                      Synthesized from {repoRules.length}{" "}
                      feedback signal{repoRules.length !== 1 ? "s" : ""} on this
                      repo
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {repoRules.map((rule, i) => (
                        <div
                          key={`${rule.category}-${rule.path_pattern}-${i}`}
                          className="space-y-1.5 rounded-lg border p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${SIGNAL_STYLE[rule.source_signal] ?? ""}`}
                            >
                              {SIGNAL_LABEL[rule.source_signal] ??
                                rule.source_signal}
                            </Badge>
                            {rule.category && (
                              <span className="text-xs font-medium text-muted-foreground">
                                {rule.category}
                              </span>
                            )}
                            {rule.path_pattern && (
                              <span className="font-mono text-xs text-muted-foreground">
                                {rule.path_pattern}
                              </span>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground">
                              {rule.sample_count}{" "}
                              sample{rule.sample_count !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/90">
                            {rule.rule_text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
