#pragma once

#include <cstdint>

#include "quant/black_scholes.hpp"

namespace quant {

struct MonteCarloResult {
  double price;
  double standard_error;
};

MonteCarloResult monte_carlo_price(
  const OptionInput& option,
  std::uint32_t paths,
  std::uint32_t seed);

}  // namespace quant
