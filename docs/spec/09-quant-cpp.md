## Purpose

Track the C++ gRPC service that will eventually handle options pricing, IV surfaces, and Monte Carlo analytics even though Phase 0 only keeps a stub.

## Inputs

- gRPC proto definitions in `ops/proto`.
- Build configuration targeting C++20.
- Placeholder request/response structs for Black-Scholes.

## Outputs

- Compilable stub binary (no deployment yet) proving the toolchain works.
- Future endpoints for `priceOption`, `computeGreeks`, `simulatePath`.

## Invariants

- Code uses modern C++ (no raw new/delete, prefer `std::vector`, `std::chrono`).
- Exposed functions stay deterministic for regression testing.
- Stub keeps interface compatible with future FastAPI stats pod for integration.

## Example

`services/quant-cpp` currently exports a `price_option` stub that returns a canned response; later phases will swap in actual math without changing the API.

## Test Checklist

- `cmake --build` (or equivalent) succeeds locally when the user opts into the C++ toolchain.
- Proto files stay in sync with the TypeScript SDK once implemented.
