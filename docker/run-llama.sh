#!/bin/sh
# Wrapper around llama-server that conditionally adds -fa (flash-attention)
# only when the binary actually supports it — matching the check in start.sh.
FA_FLAG=""
if llama-server --help 2>&1 | grep -q "\-fa\|flash.attn"; then
    FA_FLAG="-fa"
fi

exec llama-server \
    -m "$MODEL_PATH" \
    -c "$LLM_CONTEXT" \
    -ngl "$LLM_NGL" \
    -t "$LLM_THREADS" \
    --port 8080 \
    --host 127.0.0.1 \
    $FA_FLAG \
    --log-disable
