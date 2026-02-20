# ╔══════════════════════════════════════════════════════╗
# ║  Adaptive Dashboard — Multi-stage Docker Image       ║
# ║  Supports: NVIDIA CUDA · AMD ROCm · CPU              ║
# ║  (Apple Silicon uses start.sh, not Docker)           ║
# ╚══════════════════════════════════════════════════════╝

# ── Stage 1: Build llama.cpp ─────────────────────────────────
# Use build ARG to switch between cuda/rocm/cpu
ARG BUILD_TYPE=cuda

FROM nvidia/cuda:12.2.0-devel-ubuntu22.04 AS builder-cuda
FROM rocm/dev-ubuntu-22.04:5.7 AS builder-rocm
FROM ubuntu:22.04 AS builder-cpu

# Select base based on BUILD_TYPE (default cuda)
FROM builder-${BUILD_TYPE} AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    git cmake build-essential ninja-build \
    libcurl4-openssl-dev wget curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 https://github.com/ggerganov/llama.cpp .

# Build flags per type
ARG BUILD_TYPE=cuda
RUN if [ "$BUILD_TYPE" = "cuda" ]; then \
      cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release -GNinja; \
    elif [ "$BUILD_TYPE" = "rocm" ]; then \
      cmake -B build -DGGML_HIP=ON -DCMAKE_BUILD_TYPE=Release -GNinja; \
    else \
      cmake -B build -DCMAKE_BUILD_TYPE=Release -GNinja; \
    fi \
    && cmake --build build --target llama-server

# ── Stage 2: Build frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# ── Stage 3: Runtime image ────────────────────────────────────
FROM ubuntu:22.04 AS runtime

ARG BUILD_TYPE=cuda
ENV BUILD_TYPE=${BUILD_TYPE}
ENV DEBIAN_FRONTEND=noninteractive

# Runtime libs
RUN apt-get update && apt-get install -y \
    libcurl4 libgomp1 curl wget \
    nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

# CUDA runtime libs (only needed for cuda builds)
RUN if [ "$BUILD_TYPE" = "cuda" ]; then \
    apt-get update && apt-get install -y libcublas-12-2 && rm -rf /var/lib/apt/lists/* ; \
    fi

# Copy llama-server binary
COPY --from=builder /build/build/bin/llama-server /usr/local/bin/llama-server
RUN chmod +x /usr/local/bin/llama-server

# Copy built frontend
COPY --from=frontend-builder /app/dist /var/www/dashboard

# Nginx config to serve frontend + proxy LLM API
RUN cat > /etc/nginx/sites-enabled/default << 'EOF'
server {
    listen 3000;
    root /var/www/dashboard;
    index index.html;

    location /v1/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location /health {
        proxy_pass http://127.0.0.1:8080/health;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Supervisor to manage both processes
COPY docker/supervisord.conf /etc/supervisor/conf.d/dashboard.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

VOLUME ["/models"]
ENV MODEL_PATH=/models/Phi-3.5-mini-instruct-Q4_K_M.gguf
ENV LLM_CONTEXT=4096
ENV LLM_THREADS=4
ENV LLM_NGL=999

ENTRYPOINT ["/entrypoint.sh"]
