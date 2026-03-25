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
