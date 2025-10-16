#include "quant/monte_carlo.hpp"

#include <algorithm>
#include <cmath>
#include <random>
#include <vector>

namespace quant {

MonteCarloResult monte_carlo_price(
  const OptionInput& option,
  std::uint32_t paths,
  std::uint32_t seed) {
  if (paths == 0U) {
    return MonteCarloResult{.price = 0.0, .standard_error = 0.0};
  }

  std::mt19937 rng(seed);
  std::normal_distribution<double> standard_normal(0.0, 1.0);

  const double S = option.spot;
  const double K = option.strike;
  const double r = option.rate;
  const double q = option.dividend_yield;
  const double sigma = option.volatility;
  const double T = option.time_to_maturity;

  const double drift = (r - q - 0.5 * sigma * sigma) * T;
  const double diffusion = sigma * std::sqrt(T);
  const double discount = std::exp(-r * T);

  std::vector<double> payoffs;
  payoffs.reserve(paths);

  double sum = 0.0;
  for (std::uint32_t i = 0; i < paths; ++i) {
    const double z = standard_normal(rng);
    const double terminal = S * std::exp(drift + diffusion * z);
    const double payoff = option.is_call
      ? std::max(terminal - K, 0.0)
      : std::max(K - terminal, 0.0);
    payoffs.push_back(payoff);
    sum += payoff;
  }

  const double mean_payoff = sum / static_cast<double>(paths);
  double variance_sum = 0.0;
  for (double payoff : payoffs) {
    const double diff = payoff - mean_payoff;
    variance_sum += diff * diff;
  }

  const double variance = variance_sum / static_cast<double>(paths);
  const double stddev = std::sqrt(variance);
  const double standard_error = stddev / std::sqrt(static_cast<double>(paths));

  return MonteCarloResult{
    .price = discount * mean_payoff,
    .standard_error = discount * standard_error,
  };
}

}  // namespace quant
