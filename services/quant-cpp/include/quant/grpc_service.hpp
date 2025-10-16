#pragma once

#include <grpcpp/grpcpp.h>

#include "quant.grpc.pb.h"

#include "quant/black_scholes.hpp"
#include "quant/monte_carlo.hpp"

namespace quant {

OptionInput option_from_proto(const crucible::quant::OptionSpecification& proto);

class QuantGrpcService final : public crucible::quant::QuantService::Service {
 public:
  QuantGrpcService() = default;
  ~QuantGrpcService() override = default;

  grpc::Status Price(
    grpc::ServerContext* context,
    const crucible::quant::PriceRequest* request,
    crucible::quant::PriceResponse* response) override;

  grpc::Status Greeks(
    grpc::ServerContext* context,
    const crucible::quant::PriceRequest* request,
    crucible::quant::GreeksResponse* response) override;

  grpc::Status ImpliedVol(
    grpc::ServerContext* context,
    const crucible::quant::ImpliedVolRequest* request,
    crucible::quant::ImpliedVolResponse* response) override;

  grpc::Status MonteCarlo(
    grpc::ServerContext* context,
    const crucible::quant::MonteCarloRequest* request,
    crucible::quant::MonteCarloResponse* response) override;
};

}  // namespace quant
