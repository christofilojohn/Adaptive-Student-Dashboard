# ╔══════════════════════════════════════════════════════════╗
# ║         Adaptive Dashboard — Makefile                    ║
# ║   Usage:  make          → install deps + launch          ║
# ║           make install  → install llama-server + npm     ║
# ║           make run      → start everything               ║
# ╚══════════════════════════════════════════════════════════╝

.PHONY: all install run stop install-llama install-node \
        docker-nvidia docker-amd docker-cpu docker-build-nvidia \
        docker-build-amd docker-build-cpu docker-download-model \
        clean help

# Default: install everything then run
all: install run

# ── Native ────────────────────────────────────────────────────

## Install all dependencies (llama-server + npm packages)
install: install-llama
	@echo "[make] Installing npm dependencies..."
	cd frontend && npm install --silent
	@echo "[✓] All dependencies installed"

## Install llama-server (auto-detects GPU platform)
install-llama:
	@if command -v llama-server >/dev/null 2>&1; then \
	  echo "[✓] llama-server already installed: $$(which llama-server)"; \
	else \
	  echo "[make] Installing llama-server..."; \
	  bash scripts/install-llama.sh; \
	fi

## Launch the full dashboard (LLM + frontend)
run:
	bash start.sh

## Alias for run
start: run

# ── Docker ────────────────────────────────────────────────────

## Download the model into ./models/ via Docker
docker-download-model:
	mkdir -p models
	docker compose --profile download run --rm download-model

## Build + launch for NVIDIA GPU
docker-nvidia: docker-build-nvidia
	docker compose --profile nvidia up

## Build + launch for AMD ROCm GPU
docker-amd: docker-build-amd
	docker compose --profile amd up

## Build + launch for CPU-only
docker-cpu: docker-build-cpu
	docker compose --profile cpu up

docker-build-nvidia:
	docker build --build-arg BUILD_TYPE=cuda -t adaptive-dashboard .

docker-build-amd:
	docker build --build-arg BUILD_TYPE=rocm -t adaptive-dashboard-rocm .

docker-build-cpu:
	docker build --build-arg BUILD_TYPE=cpu -t adaptive-dashboard-cpu .

# ── Cleanup ───────────────────────────────────────────────────

## Remove log files
clean:
	rm -f .llm.log .ui.log
	@echo "[✓] Cleaned log files"

# ── Help ──────────────────────────────────────────────────────

help:
	@echo ""
	@echo "  Adaptive Dashboard — available targets"
	@echo ""
	@echo "  Native:"
	@echo "    make            Install deps + launch (default)"
	@echo "    make install    Install llama-server + npm packages"
	@echo "    make run        Start LLM server + frontend"
	@echo ""
	@echo "  Docker:"
	@echo "    make docker-download-model   Download model to ./models/"
	@echo "    make docker-nvidia           Build + run (NVIDIA CUDA)"
	@echo "    make docker-amd              Build + run (AMD ROCm)"
	@echo "    make docker-cpu              Build + run (CPU only)"
	@echo ""
	@echo "  Misc:"
	@echo "    make clean      Remove .llm.log / .ui.log"
	@echo "    make help       Show this message"
	@echo ""
