#include <cmath>
#include <cstdlib>
#include <iostream>

#include "quant/black_scholes.hpp"
#include "quant/monte_carlo.hpp"

namespace {

void assert_condition(bool condition, const char* message) {
  if (!condition) {
    std::cerr << message << '\n';
    std::exit(EXIT_FAILURE);
  }
}

}  // namespace

int main() {
  const quant::OptionInput option{
    .spot = 120.0,
    .strike = 110.0,
    .rate = 0.015,
    .volatility = 0.25,
    .time_to_maturity = 0.75,
    .dividend_yield = 0.0,
    .is_call = true,
  };

  const auto analytic = quant::black_scholes(option);
  const auto mc = quant::monte_carlo_price(option, 100'000U, 42U);

  const double tolerance = analytic.price * 0.02;  // 2% tolerance
  const double diff = std::abs(mc.price - analytic.price);
  assert_condition(diff < tolerance, "Monte Carlo price deviates beyond tolerance");
  assert_condition(mc.standard_error > 0.0, "Monte Carlo standard error should be positive");
  assert_condition(mc.standard_error < tolerance, "Monte Carlo standard error too large");

  return EXIT_SUCCESS;
}
