#include "quant/grpc_service.hpp"

#include <algorithm>
#include <cstdint>
#include <limits>

#include <grpcpp/server_context.h>

namespace quant {

namespace {

OptionInput sanitize_option(const OptionInput& option) {
  OptionInput sanitized = option;
  sanitized.volatility = std::max(option.volatility, 1e-6);
  sanitized.time_to_maturity = std::max(option.time_to_maturity, 1e-6);
  sanitized.strike = std::max(option.strike, 1e-6);
  sanitized.spot = std::max(option.spot, 1e-6);
  return sanitized;
}

}  // namespace

OptionInput option_from_proto(const crucible::quant::OptionSpecification& proto) {
  return OptionInput{
    .spot = proto.spot(),
    .strike = proto.strike(),
    .rate = proto.rate(),
    .volatility = proto.volatility(),
    .time_to_maturity = proto.time_to_maturity(),
    .dividend_yield = proto.dividend(),
    .is_call = proto.is_call(),
  };
}

grpc::Status QuantGrpcService::Price(
  grpc::ServerContext*,
  const crucible::quant::PriceRequest* request,
  crucible::quant::PriceResponse* response) {
  if (request == nullptr || response == nullptr) {
    return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "request/response must not be null");
  }
  const OptionInput option = sanitize_option(option_from_proto(request->option()));
  const auto greeks = black_scholes(option);
  response->set_price(greeks.price);
  return grpc::Status::OK;
}

grpc::Status QuantGrpcService::Greeks(
  grpc::ServerContext*,
  const crucible::quant::PriceRequest* request,
  crucible::quant::GreeksResponse* response) {
  if (request == nullptr || response == nullptr) {
    return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "request/response must not be null");
  }
  const OptionInput option = sanitize_option(option_from_proto(request->option()));
  const auto greeks = black_scholes(option);
  response->set_price(greeks.price);
  response->set_delta(greeks.delta);
  response->set_gamma(greeks.gamma);
  response->set_vega(greeks.vega);
  response->set_theta(greeks.theta);
  response->set_rho(greeks.rho);
  return grpc::Status::OK;
}

grpc::Status QuantGrpcService::ImpliedVol(
  grpc::ServerContext*,
  const crucible::quant::ImpliedVolRequest* request,
  crucible::quant::ImpliedVolResponse* response) {
  if (request == nullptr || response == nullptr) {
    return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "request/response must not be null");
  }
  OptionInput option = sanitize_option(option_from_proto(request->option()));
  option.volatility = std::max(option.volatility, 1e-6);
  const auto result = implied_volatility(option, request->target_price());
  response->set_implied_volatility(result.implied_volatility);
  response->set_converged(result.converged);
  response->set_iterations(static_cast<std::uint32_t>(result.iterations));
  return grpc::Status::OK;
}

grpc::Status QuantGrpcService::MonteCarlo(
  grpc::ServerContext*,
  const crucible::quant::MonteCarloRequest* request,
  crucible::quant::MonteCarloResponse* response) {
  if (request == nullptr || response == nullptr) {
    return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "request/response must not be null");
  }
  const OptionInput option = sanitize_option(option_from_proto(request->option()));
  const std::uint32_t paths = request->paths() == 0U ? 10'000U : request->paths();
  const std::uint32_t seed = request->seed();
  const auto result = monte_carlo_price(option, paths, seed);
  response->set_price(result.price);
  response->set_standard_error(result.standard_error);
  return grpc::Status::OK;
}

}  // namespace quant
