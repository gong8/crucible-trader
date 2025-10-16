cmake_minimum_required(VERSION 3.20)

project(quant_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(CRUCIBLE_USE_BUNDLED_GRPC "Fetch and build gRPC/Protobuf from source (slower). Default OFF uses system packages." OFF)

if(APPLE AND CMAKE_SYSTEM_PROCESSOR STREQUAL "arm64")
  # Build a single-arch binary to avoid gRPC's x86 SSE flags on Apple Silicon.
  set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "" FORCE)
endif()

if(CRUCIBLE_USE_BUNDLED_GRPC)
  include(FetchContent)

  set(ABSL_PROPAGATE_CXX_STD ON CACHE BOOL "" FORCE)
  set(ABSL_BUILD_TESTING OFF CACHE BOOL "" FORCE)
  set(ABSL_ENABLE_INSTALL ON CACHE BOOL "" FORCE)
  set(gRPC_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(gRPC_INSTALL OFF CACHE BOOL "" FORCE)
  set(gRPC_BUILD_GRPC_CSHARP_PLUGIN OFF CACHE BOOL "" FORCE)
  set(gRPC_BUILD_GRPC_NODE_PLUGIN OFF CACHE BOOL "" FORCE)
  set(gRPC_BUILD_CODEGEN ON CACHE BOOL "" FORCE)
  set(gRPC_SSL_PROVIDER "none" CACHE STRING "" FORCE)
  set(gRPC_ZLIB_PROVIDER "package" CACHE STRING "" FORCE)
  set(gRPC_CARES_PROVIDER "none" CACHE STRING "" FORCE)
  set(protobuf_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(Protobuf_INSTALL_DEFAULT_LIBDIR lib CACHE STRING "" FORCE)
  set(CMAKE_INSTALL_MESSAGE NEVER CACHE STRING "" FORCE)

  FetchContent_Declare(
    grpc
    GIT_REPOSITORY https://github.com/grpc/grpc.git
    GIT_TAG v1.62.1
    GIT_SHALLOW TRUE
  )

  FetchContent_MakeAvailable(grpc)

  set(_PROTOBUF_PROTOC_TARGET protobuf::protoc)
  set(_GRPC_CPP_PLUGIN_TARGET grpc_cpp_plugin)
  set(_PROTOBUF_LIBRARY protobuf::libprotobuf)
  set(_GRPC_GRPCPP_LIBRARY grpc++)
else()
  find_package(gRPC CONFIG REQUIRED)

  if(NOT TARGET protobuf::libprotobuf OR NOT TARGET protobuf::protoc)
    find_package(Protobuf CONFIG REQUIRED)
  endif()

  set(_PROTOBUF_PROTOC_TARGET protobuf::protoc)
  set(_GRPC_CPP_PLUGIN_TARGET gRPC::grpc_cpp_plugin)
  set(_PROTOBUF_LIBRARY protobuf::libprotobuf)
  set(_GRPC_GRPCPP_LIBRARY gRPC::grpc++)
endif()

find_package(Threads REQUIRED)

set(PROTO_DIR ${PROJECT_SOURCE_DIR}/../../ops/proto)
set(PROTO_FILE ${PROTO_DIR}/quant.proto)
set(GENERATED_DIR ${CMAKE_CURRENT_BINARY_DIR}/generated)
file(MAKE_DIRECTORY ${GENERATED_DIR})

set(_PROTOBUF_PROTOC $<TARGET_FILE:${_PROTOBUF_PROTOC_TARGET}>)
set(_GRPC_CPP_PLUGIN $<TARGET_FILE:${_GRPC_CPP_PLUGIN_TARGET}>)

add_custom_command(
  OUTPUT
    ${GENERATED_DIR}/quant.pb.cc
    ${GENERATED_DIR}/quant.pb.h
    ${GENERATED_DIR}/quant.grpc.pb.cc
    ${GENERATED_DIR}/quant.grpc.pb.h
  COMMAND ${_PROTOBUF_PROTOC}
  ARGS --proto_path=${PROTO_DIR}
       --cpp_out=${GENERATED_DIR}
       --grpc_out=${GENERATED_DIR}
       --plugin=protoc-gen-grpc=${_GRPC_CPP_PLUGIN}
       ${PROTO_FILE}
  DEPENDS ${PROTO_FILE} ${_GRPC_CPP_PLUGIN_TARGET} ${_PROTOBUF_PROTOC_TARGET}
  COMMENT "Generating gRPC sources from ${PROTO_FILE}"
  VERBATIM
)

add_custom_target(quant_proto_gen
  DEPENDS
    ${GENERATED_DIR}/quant.pb.cc
    ${GENERATED_DIR}/quant.pb.h
    ${GENERATED_DIR}/quant.grpc.pb.cc
    ${GENERATED_DIR}/quant.grpc.pb.h
)
if(TARGET ${_GRPC_CPP_PLUGIN_TARGET})
  add_dependencies(quant_proto_gen ${_GRPC_CPP_PLUGIN_TARGET})
endif()
if(TARGET ${_PROTOBUF_PROTOC_TARGET})
  add_dependencies(quant_proto_gen ${_PROTOBUF_PROTOC_TARGET})
endif()

add_library(quant_proto STATIC ${GENERATED_DIR}/quant.pb.cc)
target_sources(quant_proto PRIVATE ${GENERATED_DIR}/quant.pb.h)
target_include_directories(quant_proto PUBLIC ${GENERATED_DIR})
target_link_libraries(quant_proto PUBLIC ${_PROTOBUF_LIBRARY})
add_dependencies(quant_proto quant_proto_gen)

add_library(quant_grpc STATIC ${GENERATED_DIR}/quant.grpc.pb.cc)
target_sources(quant_grpc PRIVATE ${GENERATED_DIR}/quant.grpc.pb.h)
target_include_directories(quant_grpc PUBLIC ${GENERATED_DIR})
target_link_libraries(quant_grpc PUBLIC ${_GRPC_GRPCPP_LIBRARY} quant_proto)
add_dependencies(quant_grpc quant_proto_gen)

add_library(quant_core STATIC
  src/black_scholes.cpp
  src/monte_carlo.cpp
)

target_include_directories(quant_core PUBLIC include)

add_executable(quant_server
  src/server_main.cpp
  src/grpc_service.cpp
)

target_link_libraries(quant_server PRIVATE quant_core quant_grpc Threads::Threads)

enable_testing()

add_executable(test_black_scholes tests/test_black_scholes.cpp)
target_link_libraries(test_black_scholes PRIVATE quant_core)
add_test(NAME black_scholes COMMAND test_black_scholes)

add_executable(test_monte_carlo tests/test_monte_carlo.cpp)
target_link_libraries(test_monte_carlo PRIVATE quant_core)
add_test(NAME monte_carlo COMMAND test_monte_carlo)
