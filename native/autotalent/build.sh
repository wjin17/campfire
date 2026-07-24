#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ../../src/renderer/public/worklet
emcc -O3 --no-entry -std=gnu89 -Wno-implicit-function-declaration \
  wrapper.c autotalent.c mayer_fft.c -I. \
  -s STANDALONE_WASM=1 \
  -s EXPORTED_FUNCTIONS=_at_init,_at_port_count,_at_port_name,_at_port_is_control_input,_at_port_lower,_at_port_upper,_at_set_control,_at_get_control,_at_in_ptr,_at_out_ptr,_at_process,_malloc,_free \
  -o ../../src/renderer/public/worklet/autotalent.wasm
