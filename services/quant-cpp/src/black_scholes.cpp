#include "quant/black_scholes.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace {

constexpr double kSqrtTwo = 1.41421356237309504880;
constexpr double kInvSqrtTwoPi = 0.39894228040143267794;  // 1/sqrt(2*pi)

double normal_pdf(double x) {
  return kInvSqrtTwoPi * std::exp(-0.5 * x * x);
}

double normal_cdf(double x) {
  return 0.5 * std::erfc(-x / kSqrtTwo);
}

}  // namespace

namespace quant {

OptionGreeks black_scholes(const OptionInput& option) {
  const double eps = 1e-9;
  const double S = std::max(option.spot, eps);
  const double K = std::max(option.strike, eps);
  const double r = option.rate;
  const double q = option.dividend_yield;
  const double sigma = std::max(option.volatility, eps);
  const double T = std::max(option.time_to_maturity, eps);

  const double sqrtT = std::sqrt(T);
  const double sigmaSqT = sigma * sqrtT;

  const double forward = S * std::exp(-q * T);
  const double discount = std::exp(-r * T);
  const double logTerm = std::log(S / K);
  const double d1 = (logTerm + (r - q + 0.5 * sigma * sigma) * T) / sigmaSqT;
  const double d2 = d1 - sigmaSqT;

  const double pdfD1 = normal_pdf(d1);

  double price = 0.0;
  double delta = 0.0;
  double theta = 0.0;
  double rho = 0.0;

  if (option.is_call) {
    price = forward * normal_cdf(d1) - K * discount * normal_cdf(d2);
    delta = std::exp(-q * T) * normal_cdf(d1);
    theta = - (S * std::exp(-q * T) * pdfD1 * sigma) / (2.0 * sqrtT)
            - r * K * discount * normal_cdf(d2)
            + q * S * std::exp(-q * T) * normal_cdf(d1);
    rho = K * T * discount * normal_cdf(d2);
  } else {
    price = K * discount * normal_cdf(-d2) - forward * normal_cdf(-d1);
    delta = std::exp(-q * T) * (normal_cdf(d1) - 1.0);
    theta = - (S * std::exp(-q * T) * pdfD1 * sigma) / (2.0 * sqrtT)
            + r * K * discount * normal_cdf(-d2)
            - q * S * std::exp(-q * T) * normal_cdf(-d1);
    rho = -K * T * discount * normal_cdf(-d2);
  }

  const double gamma = std::exp(-q * T) * pdfD1 / (S * sigmaSqT);
  const double vega = S * std::exp(-q * T) * pdfD1 * sqrtT;

  return OptionGreeks{
    .price = price,
    .delta = delta,
    .gamma = gamma,
    .vega = vega,
    .theta = theta,
    .rho = rho,
  };
}

ImpliedVolatilityResult implied_volatility(
  const OptionInput& option,
  double target_price,
  double lower_bound,
  double upper_bound,
  double tolerance,
  std::size_t max_iterations) {
  double low = lower_bound;
  double high = upper_bound;
  double mid = 0.0;
  bool converged = false;
  std::size_t iteration = 0;

  for (; iteration < max_iterations; ++iteration) {
    mid = 0.5 * (low + high);
    OptionInput guess = option;
    guess.volatility = mid;
    const double price = black_scholes(guess).price;
    const double diff = price - target_price;

    if (std::abs(diff) < tolerance) {
      converged = true;
      break;
    }

    if (diff > 0.0) {
      high = mid;
    } else {
      low = mid;
    }

    if (std::abs(high - low) < tolerance) {
      converged = true;
      break;
    }
  }

  return ImpliedVolatilityResult{
    .implied_volatility = mid,
    .converged = converged,
    .iterations = iteration + 1,
  };
}

}  // namespace quant
