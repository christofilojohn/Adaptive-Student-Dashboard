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
# Pinned to a stable release for reproducible builds.
# To upgrade: update the tag and verify the -fa flag behaviour is unchanged.
RUN git clone --depth 1 --branch b4887 https://github.com/ggerganov/llama.cpp .

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
    apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/3bf863cc.pub | gpg --dearmor -o /usr/share/keyrings/cuda-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cuda-archive-keyring.gpg] https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/ /" > /etc/apt/sources.list.d/cuda.list && \
    apt-get update && apt-get install -y libcublas-12-2 && \
    rm -rf /var/lib/apt/lists/* ; \
    fi

# ROCm runtime libs (only needed for rocm/amd builds)
# libhip.so and libamdhip64.so are required by a HIP-compiled llama-server
RUN if [ "$BUILD_TYPE" = "rocm" ]; then \
    apt-get update && apt-get install -y wget gnupg && \
    mkdir -p --mode=0755 /usr/share/keyrings && \
    wget -qO - https://repo.radeon.com/rocm/rocm.gpg.key | gpg --dearmor -o /usr/share/keyrings/rocm-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/rocm-archive-keyring.gpg] https://repo.radeon.com/rocm/apt/5.7 jammy main" > /etc/apt/sources.list.d/rocm.list && \
    apt-get update && apt-get install -y rocm-hip-runtime && \
    rm -rf /var/lib/apt/lists/* ; \
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
# State JSON in LLM prompts can exceed nginx's 1 MB default
client_max_body_size 10M;

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
COPY docker/supervisord.conf /etc/supervisor/supervisord.conf
COPY docker/run-llama.sh /docker/run-llama.sh
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /docker/run-llama.sh /entrypoint.sh

EXPOSE 3000

VOLUME ["/models"]
ENV MODEL_PATH=/models/Phi-3.5-mini-instruct-Q4_K_M.gguf
ENV LLM_CONTEXT=4096
ENV LLM_THREADS=4
ENV LLM_NGL=999

# Run as non-root. Port 3000 > 1024 so no capability needed.
# Replace the default 'user www-data;' directive — nginx cannot setuid() when
# it is not root, so the worker user must match the process owner.
# Pre-create the nginx pid file so the dashboard user can write to it.
RUN useradd --system --no-create-home --shell /sbin/nologin dashboard \
    && sed -i 's/^user www-data;/user dashboard;/' /etc/nginx/nginx.conf \
    && mkdir -p /var/lib/nginx/body /var/lib/nginx/proxy \
    && chown -R dashboard:dashboard /var/www/dashboard /var/log /var/lib/nginx \
    && touch /run/nginx.pid && chown dashboard:dashboard /run/nginx.pid
USER dashboard

ENTRYPOINT ["/entrypoint.sh"]
