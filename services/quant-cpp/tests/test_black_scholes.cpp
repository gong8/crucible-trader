#include <cmath>
#include <cstdlib>
#include <iostream>

#include "quant/black_scholes.hpp"

namespace {

bool nearly_equal(double lhs, double rhs, double tolerance = 1e-6) {
  return std::abs(lhs - rhs) <= tolerance;
}

void assert_near(const char* label, double actual, double expected, double tolerance) {
  if (!nearly_equal(actual, expected, tolerance)) {
    std::cerr << label << " expected " << expected << " but got " << actual << '\n';
    std::exit(EXIT_FAILURE);
  }
}

}  // namespace

int main() {
  const quant::OptionInput call_option{
    .spot = 100.0,
    .strike = 100.0,
    .rate = 0.01,
    .volatility = 0.2,
    .time_to_maturity = 1.0,
    .dividend_yield = 0.0,
    .is_call = true,
  };

  const auto call_greeks = quant::black_scholes(call_option);
  assert_near("call price", call_greeks.price, 8.433319, 1e-5);
  assert_near("call delta", call_greeks.delta, 0.559618, 1e-5);
  assert_near("call gamma", call_greeks.gamma, 0.019724, 1e-6);
  assert_near("call vega", call_greeks.vega, 39.447933, 1e-3);
  assert_near("call theta", call_greeks.theta, -4.420078, 1e-3);
  assert_near("call rho", call_greeks.rho, 47.528451, 1e-3);

  const quant::OptionInput put_option{
    .spot = 100.0,
    .strike = 100.0,
    .rate = 0.01,
    .volatility = 0.2,
    .time_to_maturity = 1.0,
    .dividend_yield = 0.0,
    .is_call = false,
  };

  const auto put_greeks = quant::black_scholes(put_option);
  assert_near("put price", put_greeks.price, 7.438302, 1e-5);
  assert_near("put delta", put_greeks.delta, -0.440382, 1e-5);
  assert_near("put gamma", put_greeks.gamma, call_greeks.gamma, 1e-6);
  assert_near("put vega", put_greeks.vega, call_greeks.vega, 1e-3);

  const double synthetic_call = put_greeks.price
    + call_option.spot * std::exp(-call_option.dividend_yield * call_option.time_to_maturity)
    - call_option.strike * std::exp(-call_option.rate * call_option.time_to_maturity);
  assert_near("put-call parity", synthetic_call, call_greeks.price, 1e-5);

  const double target_price = call_greeks.price;
  const auto iv = quant::implied_volatility(call_option, target_price);
  assert_near("implied volatility", iv.implied_volatility, call_option.volatility, 1e-4);
  if (!iv.converged) {
    std::cerr << "implied volatility solver failed to converge\n";
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
