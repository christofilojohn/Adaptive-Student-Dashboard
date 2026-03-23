#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# Default SHA-256 for the bundled Phi-3.5-mini model.
# Override via MODEL_SHA256 env var when mounting a different model file.
DEFAULT_MODEL_FILE="Phi-3.5-mini-instruct-Q4_K_M.gguf"
DEFAULT_SHA256="e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5"

# Resolve effective SHA up-front so both the download-model and startup paths
# use the same logic. If MODEL_SHA256 is not set in the environment and the
# target filename matches the default model, apply the built-in hash.
if [[ -z "${MODEL_SHA256:-}" && "$(basename "${MODEL_PATH:-}")" == "$DEFAULT_MODEL_FILE" ]]; then
    MODEL_SHA256="$DEFAULT_SHA256"
else
    MODEL_SHA256="${MODEL_SHA256:-}"
fi

echo -e "${CYAN}[dashboard]${NC} Starting Adaptive Dashboard container..."
echo -e "  GPU layers: ${LLM_NGL}"
echo -e "  Threads:    ${LLM_THREADS}"
echo -e "  Context:    ${LLM_CONTEXT}"
echo -e "  Model:      ${MODEL_PATH}"
echo ""

# Download mode — must be checked BEFORE the model-existence guard
if [[ "${1:-}" == "download-model" ]]; then
    echo "Downloading Phi-3.5-mini-instruct..."
    if ! command -v wget &>/dev/null; then
        echo -e "${RED}[✗] wget is required but not found in PATH${NC}"
        exit 1
    fi
    wget -q --show-progress \
        "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf" \
        -O "$MODEL_PATH"
    echo "$MODEL_SHA256  $MODEL_PATH" | sha256sum -c - \
        || { echo -e "${RED}[✗] SHA-256 mismatch — download may be corrupt${NC}"; rm -f "$MODEL_PATH"; exit 1; }
    echo -e "${GREEN}[✓] Model downloaded and verified${NC}"
    exit 0
fi

# Check model exists (only relevant for normal startup)
if [[ ! -f "$MODEL_PATH" ]]; then
    echo -e "${RED}[✗] Model not found at: $MODEL_PATH${NC}"
    echo ""
    echo -e "${YELLOW}Mount your models directory:${NC}"
    echo "  docker run -v /path/to/models:/models ..."
    echo ""
    echo "Or download the model first:"
    echo "  docker run --rm -v /path/to/models:/models dashboard:latest download-model"
    exit 1
fi

echo -e "${GREEN}[✓] Model found: $(du -sh "$MODEL_PATH" | awk '{print $1}')${NC}"

if [[ -z "$MODEL_SHA256" ]]; then
    echo -e "${YELLOW}[!] Skipping SHA-256 check — set MODEL_SHA256 env var to verify a custom model${NC}"
fi

if [[ -n "$MODEL_SHA256" ]]; then
    echo -n "  Verifying SHA-256... "
    if echo "$MODEL_SHA256  $MODEL_PATH" | sha256sum -c - &>/dev/null; then
        echo -e "${GREEN}ok${NC}"
    else
        echo -e "${RED}MISMATCH${NC}"
        echo -e "${RED}[✗] Model file failed integrity check. Re-download with: docker run --rm -v ... download-model${NC}"
        exit 1
    fi
fi
echo -e "${CYAN}[dashboard]${NC} Starting services..."
echo ""
echo -e "${GREEN}  Dashboard will be available at: http://localhost:3000${NC}"
echo ""

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
