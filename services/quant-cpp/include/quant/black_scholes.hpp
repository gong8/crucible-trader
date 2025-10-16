#pragma once

#include <cstddef>

namespace quant {

struct OptionInput {
  double spot;
  double strike;
  double rate;
  double volatility;
  double time_to_maturity;
  double dividend_yield;
  bool is_call;
};

struct OptionGreeks {
  double price;
  double delta;
  double gamma;
  double vega;
  double theta;
  double rho;
};

struct ImpliedVolatilityResult {
  double implied_volatility;
  bool converged;
  std::size_t iterations;
};

OptionGreeks black_scholes(const OptionInput& option);

ImpliedVolatilityResult implied_volatility(
  const OptionInput& option,
  double target_price,
  double lower_bound = 1e-6,
  double upper_bound = 5.0,
  double tolerance = 1e-6,
  std::size_t max_iterations = 100);

}  // namespace quant
