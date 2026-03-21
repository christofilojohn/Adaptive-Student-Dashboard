#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}[dashboard]${NC} Starting Adaptive Dashboard container..."
echo -e "  GPU layers: ${LLM_NGL}"
echo -e "  Threads:    ${LLM_THREADS}"
echo -e "  Context:    ${LLM_CONTEXT}"
echo -e "  Model:      ${MODEL_PATH}"
echo ""

# Download mode — must be checked BEFORE the model-existence guard
if [[ "${1:-}" == "download-model" ]]; then
    echo "Downloading Phi-3.5-mini-instruct..."
    if command -v wget &>/dev/null; then
        wget -q --show-progress \
            "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf" \
            -O "$MODEL_PATH"
    fi
    echo -e "${GREEN}[✓] Model downloaded${NC}"
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
echo -e "${CYAN}[dashboard]${NC} Starting services..."
echo ""
echo -e "${GREEN}  Dashboard will be available at: http://localhost:3000${NC}"
echo ""

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
