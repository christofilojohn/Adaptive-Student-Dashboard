# 🧠 Adaptive Dashboard

A local-first AI dashboard powered by **Phi-3.5-mini** running entirely on your hardware.

## Quick Start

### 🍎 macOS (Apple Silicon — M1/M2/M3/M4)

The fastest path — native Metal GPU acceleration, no Docker needed:

```bash
# 1. Install llama.cpp (one-time)
brew install llama.cpp

# 2. Install Node.js if needed (one-time)
brew install node

# 3. Launch everything
./start.sh
```

The script will:
- ✅ Detect your M-series chip and use Metal GPU
- ✅ Download the model automatically (~2.4 GB, one-time)
- ✅ Start the LLM server + React frontend
- ✅ Open your browser to `http://localhost:5173`

---

### 🟢 NVIDIA GPU (Linux / Windows WSL2)

**Option A — Docker (recommended, easiest):**

```bash
# Prerequisites: Docker + NVIDIA Container Toolkit
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# Download the model first
mkdir -p models
docker compose --profile download run download-model

# Launch
docker compose --profile nvidia up
```
→ Open `http://localhost:3000`

**Option B — Native (faster cold start):**

```bash
# Build llama.cpp with CUDA
./scripts/install-llama.sh

# Install Node.js if needed
# Ubuntu: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 20

# Launch
./start.sh
```

---

### 🔴 AMD GPU (Linux — ROCm)

**Option A — Docker:**

```bash
# Prerequisites: ROCm drivers installed
# https://rocm.docs.amd.com/projects/install-on-linux/en/latest/

mkdir -p models
docker compose --profile download run download-model
docker compose --profile amd up
```

> If your GPU isn't auto-detected, set `HSA_OVERRIDE_GFX_VERSION` in `.env`:
> ```
> # .env
> HSA_OVERRIDE_GFX_VERSION=10.3.0   # RX 6000 series
> HSA_OVERRIDE_GFX_VERSION=11.0.0   # RX 7000 series
> ```

**Option B — Native:**

```bash
./scripts/install-llama.sh   # auto-detects ROCm
./start.sh
```

---

### 🖥️ CPU-only fallback

Works on any machine, just slower (~3-8 tokens/sec):

```bash
# Docker
docker compose --profile cpu up

# Native
./start.sh    # auto-falls-back to CPU mode
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│            Your Browser                 │
│         localhost:5173 (dev)            │
│         localhost:3000 (docker)         │
└──────────────────┬──────────────────────┘
                   │  HTTP / REST
         ┌─────────┴─────────┐
         │   Vite / Nginx    │  (frontend)
         └─────────┬─────────┘
                   │  proxy /v1/*
         ┌─────────┴─────────┐
         │   llama-server    │  :8080
         │  Phi-3.5-mini     │
         │  OpenAI-compat API│
         └─────────┬─────────┘
                   │
         ┌─────────┴─────────┐
         │   Metal / CUDA    │
         │   ROCm / CPU      │
         └───────────────────┘
```

## Docker Build Details

| Profile   | Base Image              | GPU backend    |
|-----------|-------------------------|----------------|
| `nvidia`  | `nvidia/cuda:12.2`      | CUDA           |
| `amd`     | `rocm/dev-ubuntu-22.04` | HIP/ROCm       |
| `cpu`     | `ubuntu:22.04`          | CPU (AVX2)     |

Build a specific image manually:

```bash
# NVIDIA
docker build --build-arg BUILD_TYPE=cuda -t adaptive-dashboard .

# AMD
docker build --build-arg BUILD_TYPE=rocm -t adaptive-dashboard-rocm .

# CPU
docker build --build-arg BUILD_TYPE=cpu -t adaptive-dashboard-cpu .
```

## File Layout

```
dashboard/
├── start.sh                 ← 🚀 Main launcher (all platforms)
├── docker-compose.yml       ← Docker (NVIDIA / AMD / CPU profiles)
├── Dockerfile               ← Multi-stage build
├── .env.example             ← Config template
├── frontend/
│   ├── src/App.jsx          ← Your dashboard app
│   ├── src/main.jsx
│   ├── index.html
│   ├── vite.config.js       ← Proxies /v1/* to llama-server
│   └── package.json
├── scripts/
│   └── install-llama.sh    ← llama.cpp auto-installer
└── docker/
    ├── supervisord.conf     ← Manages llama-server + nginx
    └── entrypoint.sh
```

## Changing the Model

The default is `Phi-3.5-mini-instruct-Q4_K_M` (~2.4 GB, great quality/speed).
To use a different model, edit `start.sh`:

```bash
MODEL_FILE="your-model.gguf"
MODEL_REPO="author/repo-name-GGUF"
```

Or for Docker, mount your model and set `MODEL_PATH`:
```yaml
environment:
  - MODEL_PATH=/models/your-model.gguf
```

## Gmail Task Sync (Optional)

You can sync recent Gmail messages into dashboard tasks using Zhipu AI extraction.

1. Copy env template and set credentials:
```bash
cp .env.example .env
```

2. In `.env`, configure:
- `ZHIPU_API_KEY` (required)
- Gmail auth via either:
  - `GMAIL_ACCESS_TOKEN`, or
  - `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN`

3. Start the app with `./start.sh`, then use:
- Quick action: `sync gmail tasks`
- Quick action: `show gmail emails`
- Or chat: `sync gmail tasks`
- Or chat: `show gmail emails`

The frontend calls `POST /search/gmail-tasks-sync` on the local backend, then adds extracted tasks to your list.
It can also call `POST /search/gmail-emails` to render a Gmail inbox panel on the dashboard.
Clicking an email can call `POST /search/gmail-email-detail` to show full message detail (subject/from/to/body).
If the email contains HTML content, the dashboard renders a sanitized HTML version in the detail pane.
`/search/gmail-tasks-sync` now uses a GLM second pass to score task priority (`high|medium|low`) with `priorityScore` and `priorityReason`.
`/search/gmail-emails` and `/search/gmail-email-detail` are cached locally in SQLite (`gmail_cache`) to reduce repeated Gmail API calls.
Use `{ "forceRefresh": true }` in those requests to bypass cache when needed.

## GLM Email Understanding (Detailed)

The dashboard now supports an adaptive Gmail workflow that can understand incoming emails and convert them into actionable dashboard items.

### 1) Automatic email-to-task extraction

When you run Gmail sync (`POST /search/gmail-tasks-sync`, or UI command `sync gmail tasks`):
- The backend reads recent emails from Gmail.
- GLM extracts task candidates from message content.
- Each task receives:
  - `priority` (`high|medium|low`)
  - `priorityScore`
  - `priorityReason`
- New tasks are inserted into the Tasks list automatically.
- Duplicate protection is applied using `sourceEmailId + normalized task text`.

This means assignment/deadline emails can be recognized and converted into tasks without manual rewriting.

### 2) Bill recognition and budget insertion

Billing/payment emails can be converted into Budget items through the Gmail panel flow:
- Drag an email card into the **Budget** panel.
- The frontend calls `POST /search/gmail-email-to-expense`.
- GLM classifies whether the email is a bill/payment and extracts:
  - `description`
  - `amount`
  - `category`
- If the email is bill-like and amount is valid, an expense is added automatically.
- If it is not a valid bill/payment email, the conversion is skipped safely.
- Duplicate protection is applied using `sourceEmailId + description + amount`.

### 3) Test email generation (randomized each run)

The Gmail panel includes a **Generate tests** button (next to **Refresh**):
- Calls `POST /search/gmail-generate-sample-emails`
- Uses GLM to generate realistic randomized test emails:
  - `assignment`
  - `meeting`
  - `bill`
- Subjects/body details vary per run
- Inbox refreshes automatically after sending

This lets you quickly verify the task extraction and budget conversion pipeline.

### 4) Scrutability (Adaptive Inspector audit trail)

All key conversion actions are logged in **Adaptive Inspector**:
- email converted to task
- email converted to budget expense
- duplicate skipped
- conversion failure

Logs include evidence fields such as email subject/id, detected priority or amount/category, and model reasoning where available.

### Required Gmail scopes for this flow

For full inbox + send + conversion testing, include:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send` (or `gmail.modify`)

Recommended env for test generation target:
- `GMAIL_TEST_TO=you@example.com`

If `GMAIL_TEST_TO` is not set, the backend attempts to resolve your Gmail profile address.

## Run Locally (Frontend + Search Backend)

Use this flow when you want to run and test Gmail adaptive features directly.

1. Create env file:
```bash
cp .env.example .env
```

2. In `.env`, set at least:
- `ZHIPU_API_KEY`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_TEST_TO` (recommended for Generate tests)

3. Start search backend (Terminal A):
```bash
cd /path/to/Adaptive-Student-Dashboard
node backend/search-server.mjs
```

4. Start frontend (Terminal B):
```bash
cd /path/to/Adaptive-Student-Dashboard/frontend
npm install
npm run dev
```

5. Open:
- `http://localhost:5173`

6. Validate the feature:
- Open **Gmail** panel
- Click **Generate tests** to create randomized assignment/meeting/bill emails
- Run `sync gmail tasks` (or use the quick action) to auto-add extracted tasks
- Drag a generated bill email to **Budget** to auto-add an expense
- Check **Adaptive Inspector** for conversion logs

## Local File Database (SQLite)

The dashboard now supports local state persistence in a file-based SQLite database:

- Default file: `./data/dashboard.sqlite`
- Backend endpoints:
  - `POST /search/dashboard-state-load`
  - `POST /search/dashboard-state-save`

You can override path/limits in `.env`:

- `DASHBOARD_DB_PATH`
- `DASHBOARD_DB_DIR`
- `SEARCH_MAX_BODY_BYTES`
- `DASHBOARD_STATE_MAX_BYTES`

## Troubleshooting

**LLM not responding:**
```bash
# Check llama-server logs
cat .llm.log
# Or for docker
docker compose logs dashboard-nvidia
```

**GPU not used (NGL=0):**
- macOS: ensure you installed llama.cpp with Metal (`brew install llama.cpp` does this automatically)
- NVIDIA: verify `nvidia-smi` works and CUDA is installed
- AMD: verify `rocm-smi` works; try setting `HSA_OVERRIDE_GFX_VERSION`

**Port conflict:**
Edit `LLM_PORT` or `UI_PORT` at the top of `start.sh`.

**Model download failed:**
```bash
pip install huggingface-hub
huggingface-cli download bartowski/Phi-3.5-mini-instruct-GGUF \
  Phi-3.5-mini-instruct-Q4_K_M.gguf \
  --local-dir ~/.cache/dashboard-models
```
