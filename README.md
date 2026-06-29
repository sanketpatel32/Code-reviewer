<p align="center">
  <img src=".github/assets/logo.png" alt="Mira logo" width="120" />
</p>

<h1 align="center">Miracode — personal AI code reviewer</h1>

<p align="center">
  <strong>A self-hosted, fork-friendly Mira: free models, manual repos, a tidy dashboard, and a one-command dev loop.</strong>
</p>

This is a personal fork of [Mira](https://github.com/miracodeai/mira) — the self-hosted AI code reviewer — tuned for solo / small-team use:

- **Free LLM models out of the box** (OpenRouter free tier) — no paid API key required to review code.
- **Add repos by URL** — no GitHub App, no webhooks, no installation dance. Paste a public repo and start reviewing.
- **A cleaned-up dashboard** — toasts on every action, empty-state CTAs, and a welcome banner for fresh installs.
- **A simple `uv` dev loop** mirroring my other projects: `uv run dev`, `uv run prod`, `uv run doctor`, etc.

See [`FEATURES.md`](FEATURES.md) for the full inherited feature surface.

## Dashboard

![Mira dashboard](.github/assets/Dashboard.png)

## What changed in this fork

| Area | Upstream Mira | This fork |
|---|---|---|
| Default models | Paid (Claude, GPT) | Free OpenRouter models pre-registered |
| Adding repos | GitHub App install only | GitHub App **or** paste a repo URL |
| Onboarding noise | Benchmark SVGs, deploy configs, community files | Removed; README reflects the fork |
| Dev workflow | `pip install -e .` + manual uvicorn | `uv run dev` / `uv run prod` / `uv run doctor` |
| UI feedback | Silent actions | Toasts + empty states + welcome banner |

## Quick start

### Prerequisites

- [Python 3.11+](https://www.python.org/) and [uv](https://docs.astral.sh/uv/) (`pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- [Node.js 20+](https://nodejs.org/) (only to rebuild the dashboard UI)
- An [OpenRouter](https://openrouter.ai/) account with a free API key
- A [GitHub Personal Access Token](https://github.com/settings/tokens) (no scopes needed for public repos — used to clone repo tarballs)

### 1. Clone

```bash
git clone https://github.com/sanketpatel32/Code-reviewer.git
cd Code-reviewer
```

### 2. Configure secrets

Create `.env.local` (gitignored) in the project root:

```bash
# Free LLM via OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...

# Read access to public repos (no scopes required for public repos)
GITHUB_TOKEN=ghp_...

# Dashboard login (default: admin / admin — change in .env.local)
ADMIN_PASSWORD=changeme

# Free model from the OpenRouter free tier
MIRA_MODEL=poolside/laguna-m.1:free

# Where indexes + the app DB live
MIRA_INDEX_DIR=./data/indexes
```

A dummy GitHub App private key is generated automatically on first run so the dashboard boots in **standalone mode** (manual repos, no webhooks). See [GitHub App setup](#optional-github-app-setup-for-webhook-reviews) below if you want real webhook-driven reviews.

### 3. Run

```bash
uv run dev          # dashboard + webhook server on http://localhost:8000
```

Open <http://localhost:8000>, log in (`admin` / the `ADMIN_PASSWORD` you set, default `admin`), and add your first repo from the **Repos** page or the dashboard welcome banner.

## The `uv` command set

All commands are defined in `pyproject.toml` under `[project.scripts]` and implemented in [`src/mira/dev_commands.py`](src/mira/dev_commands.py):

| Command | What it does |
|---|---|
| `uv run dev` | Serve dashboard + webhook server (autoreload) |
| `uv run prod` | Serve in production mode |
| `uv run build-ui` | Rebuild the React dashboard (`npm run build` in `ui/mira`) |
| `uv run dev-ui` | Vite dev server for the dashboard (HMR, on :5173) |
| `uv run lint` / `lint-fix` | Ruff lint / autofix |
| `uv run format` | Ruff format |
| `uv run typecheck` | mypy on `src/mira/` |
| `uv run test` / `test-cov` | pytest / pytest with coverage |
| `uv run check` | lint + typecheck + test in one shot |
| `uv run doctor` | Diagnose config: Python, LLM key, GitHub token, App creds, UI build, server reachability |

## Adding repositories

### Manual (default, no GitHub App)

1. Open the **Repos** page (`/repos`).
2. Click **Add repository**, paste any of:
   - `owner/repo` (e.g. `octocat/Hello-World`)
   - `https://github.com/owner/repo`
   - `git@github.com:owner/repo.git`
3. The repo is registered with `installation_id = 0` and queued for indexing. A toast confirms success/failure.

Add and remove repos as often as you like — removal is a single click on the trash icon that appears on row hover.

### Optional: GitHub App setup for webhook reviews

If you want **automatic reviews on every PR** (not just manual indexing), create a GitHub App:

1. Create one at [github.com/settings/apps/new](https://github.com/settings/apps/new):
   - Webhook URL: `https://your-server.com/github/webhook`
   - Permissions: Pull Requests (read+write), Contents (read+write), Issues (read+write)
   - Events: Pull requests, Issue comments
   - Generate a private key (`.pem`)
2. Add to `.env.local`:
   ```bash
   MIRA_GITHUB_APP_ID=123456
   MIRA_GITHUB_PRIVATE_KEY="$(cat private-key.pem)"
   MIRA_WEBHOOK_SECRET=your-secret
   ```
3. Restart `uv run dev`. The doctor command will report "GitHub App reachable" and the dashboard will list installed repos automatically.

Without these, Mira runs in standalone mode — everything works except incoming webhooks.

## Models

Free models are pre-registered in [`src/mira/llm/models.json`](src/mira/llm/models.json):

- `poolside/laguna-m.1:free`
- `meta-llama/llama-4-maverick:free`
- `google/gemma-3-27b-it:free`

Each is marked valid for both `indexing` and `review`, with zero cost. To use a paid model instead, add it to `models.json` (entries merge over the bundled registry by model id) and set `MIRA_MODEL`.

> Free-tier models are rate-limited and slower. If a review times out or 429s, wait a moment and retry, or swap to a paid model for that run.

## Development

```bash
uv run dev-ui      # dashboard HMR on :5173 (proxies API to :8000)
uv run dev         # backend on :8000
uv run check       # lint + typecheck + test
```

UI source lives in [`ui/mira/`](ui/mira/) (React + Vite + shadcn/ui). After editing UI, rebuild and serve it from the backend:

```bash
uv run build-ui    # writes to ui/mira/dist/, served by the backend at /
```

## License

Apache 2.0. See [LICENSE](LICENSE).
