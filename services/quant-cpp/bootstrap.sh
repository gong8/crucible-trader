#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

echo "[quant-cpp] bootstrap: expecting system gRPC/protobuf (brew install grpc protobuf)."
echo "[quant-cpp] bootstrap: run cmake -S \"${SCRIPT_DIR}\" -B \"${SCRIPT_DIR}/build\" for fast builds."
echo "[quant-cpp] bootstrap: need vendored deps? add -DCRUCIBLE_USE_BUNDLED_GRPC=ON to cmake (slower)."
