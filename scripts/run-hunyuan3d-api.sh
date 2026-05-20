#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${HUNYUAN3D_REPO_DIR:-/Users/riccardo.vitale/Desktop/Project Ai/cartella senza nome/Hunyuan3D-2}"
HOST="${HUNYUAN3D_HOST:-127.0.0.1}"
PORT="${HUNYUAN3D_PORT:-8081}"
DEVICE="${HUNYUAN3D_DEVICE:-mps}"
MODEL_PRESET="${HUNYUAN3D_MODEL_PRESET:-mini-turbo}"
MODEL_PATH="${HUNYUAN3D_MODEL_PATH:-}"
SUBFOLDER="${HUNYUAN3D_SUBFOLDER:-}"
TEX_MODEL_PATH="${HUNYUAN3D_TEX_MODEL_PATH:-tencent/Hunyuan3D-2}"
ENABLE_TEX="${HUNYUAN3D_ENABLE_TEX:-0}"

if [ ! -d "$REPO_DIR" ]; then
  echo "Hunyuan3D repo not found at: $REPO_DIR" >&2
  exit 1
fi

cd "$REPO_DIR"

PYTHON_BIN="python3"
if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
fi

if [ -z "$MODEL_PATH" ] || [ -z "$SUBFOLDER" ]; then
  case "$MODEL_PRESET" in
    mini-turbo)
      MODEL_PATH="tencent/Hunyuan3D-2mini"
      SUBFOLDER="hunyuan3d-dit-v2-mini-turbo"
      ;;
    mini)
      MODEL_PATH="tencent/Hunyuan3D-2mini"
      SUBFOLDER="hunyuan3d-dit-v2-mini"
      ;;
    mini-fast)
      MODEL_PATH="tencent/Hunyuan3D-2mini"
      SUBFOLDER="hunyuan3d-dit-v2-mini-fast"
      ;;
    full-turbo)
      MODEL_PATH="tencent/Hunyuan3D-2"
      SUBFOLDER="hunyuan3d-dit-v2-0-turbo"
      ;;
    full)
      MODEL_PATH="tencent/Hunyuan3D-2"
      SUBFOLDER="hunyuan3d-dit-v2-0"
      ;;
    full-fast)
      MODEL_PATH="tencent/Hunyuan3D-2"
      SUBFOLDER="hunyuan3d-dit-v2-0-fast"
      ;;
    *)
      echo "Unknown Hunyuan3D preset: $MODEL_PRESET" >&2
      echo "Supported presets: mini-turbo, mini, mini-fast, full-turbo, full, full-fast" >&2
      exit 1
      ;;
  esac
fi

ARGS=(
  "/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/scripts/hunyuan3d_api_server.py"
  --repo-dir "$REPO_DIR"
  --host "$HOST"
  --port "$PORT"
  --model-path "$MODEL_PATH"
  --subfolder "$SUBFOLDER"
  --tex-model-path "$TEX_MODEL_PATH"
  --device "$DEVICE"
)

if [ "$ENABLE_TEX" = "1" ]; then
  ARGS+=(--enable_tex)
fi

echo "Starting Hunyuan3D API from $REPO_DIR"
echo "Host: $HOST  Port: $PORT  Device: $DEVICE  Model: $MODEL_PATH  Subfolder: $SUBFOLDER  Preset: $MODEL_PRESET"

exec "$PYTHON_BIN" "${ARGS[@]}"
