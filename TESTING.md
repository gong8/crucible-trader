# Testing Guide - Crucible Trader

This document provides comprehensive information about the test suite for Crucible Trader Phase 0.

## Quick Start

### Run All Tests

```bash
pnpm test
```

This single command runs all tests across all packages and services in the monorepo.

### Run Tests by Scope

```bash
# Run only package tests
pnpm test:packages

# Run only service tests
pnpm test:services
```

### Run Tests for a Specific Package

```bash
# Example: Run tests for the metrics package
pnpm --filter @crucible-trader/metrics test

# Example: Run tests for the API service
pnpm --filter @crucible-trader/api test
```

## Test Coverage

### Comprehensive Test Suite

The test suite provides extensive coverage across all Phase 0 components:

#### Packages

1. **@crucible-trader/logger** (12 tests)
   - Logger creation and configuration
   - Log level handling (debug, info, warn, error)
   - Output formatting (JSON structure, timestamps)
   - Metadata handling and filtering
   - Multiple logger instances

2. **@crucible-trader/risk** (12 tests)
   - Default risk limits creation
   - Risk parameter validation
   - Boundary condition testing
   - Consistency checks between limits

3. **@crucible-trader/report** (7 tests)
   - Report manifest creation
   - Structure validation
   - Content verification

4. **@crucible-trader/metrics** (45 tests)
   - Returns calculation (7 tests)
   - Sharpe ratio calculation (7 tests)
   - Sortino ratio calculation (6 tests)
   - Maximum drawdown calculation (7 tests)
   - CAGR calculation (10 tests)
   - Metrics summary aggregation (8 tests)
   - Edge cases: empty data, zero equity, negative values

5. **@crucible-trader/sdk** (Validation suite)
   - Schema validation for DataRequest
   - Schema validation for BacktestRequest
   - Schema validation for BacktestResult
   - Schema validation for RiskProfile
   - Helper function validation (assertValid)
   - Strategy tests (existing)
   - Strategy configuration tests (existing)

6. **@crucible-trader/data**
   - Internal utilities (60+ tests):
     - `slugify`: String normalization
     - `sanitizeBar`: Bar data validation
     - `filterBarsForRequest`: Date range filtering
     - `sortBarsChronologically`: Chronological ordering
   - HTTP client (30+ tests):
     - GET requests
     - Header handling
     - Error handling
     - Timeout handling
     - Response parsing
   - Data sources (existing tests):
     - CSV source
     - Tiingo source
     - Polygon source

7. **@crucible-trader/engine** (Existing tests)
   - Backtest execution
   - Strategy integration

#### Services

1. **services/api**
   - Database operations (existing tests)
   - Job queue (15+ tests):
     - Queue creation and configuration
     - Job processing
     - Handler registration
     - Status updates
     - Error handling
     - Concurrent processing
   - End-to-end tests (existing)

2. **services/backtest-worker**
   - Placeholder (no tests yet)

## Test Structure

### Test Organization

```
packages/
  <package-name>/
    src/           # Source code
    test/          # Test files
      *.test.ts    # Test files
    package.json   # Includes "test" script

services/
  <service-name>/
    src/           # Source code
    test/          # Test files
      *.test.ts    # Test files
    package.json   # Includes "test" script
```

### Test File Naming

- Unit tests: `<module-name>.test.ts`
- Integration tests: `<feature-name>.test.ts`
- End-to-end tests: `<feature-name>.e2e.test.ts` or `<feature-name>.e2e.test.js`

## Writing Tests

### Test Framework

We use Node.js's built-in test runner with TypeScript support via ts-node.

### Basic Test Structure

```typescript
import { strict as assert } from "node:assert";
import test from "node:test";

test("descriptive test name", () => {
  const result = functionUnderTest();
  assert.equal(result, expectedValue);
});
```

### Async Tests

```typescript
test("async operation", async () => {
  const result = await asyncFunction();
  assert.ok(result);
});
```

### Test Cleanup

```typescript
test("test with cleanup", async (t) => {
  const resource = createResource();

  t.after(() => {
    cleanupResource(resource);
  });

  // Test code here
});
```

### Assertions

Using Node.js built-in assert:

```typescript
import { strict as assert } from "node:assert";

// Equality
assert.equal(actual, expected);
assert.deepEqual(actualObject, expectedObject);

// Truthiness
assert.ok(value);

// Type checks
assert.equal(typeof value, "string");

// Throws
assert.throws(() => {
  throwingFunction();
}, ErrorType);

// Rejects (for promises)
await assert.rejects(
  async () => {
    await throwingAsyncFunction();
  },
  { message: /expected error/ },
);
```

## Test Categories

### 1. Unit Tests

Test individual functions and modules in isolation.

**Example**: Testing the `slugify` function

```typescript
test("slugify converts uppercase to lowercase", () => {
  assert.equal(slugify("AAPL"), "aapl");
});
```

### 2. Integration Tests

Test interactions between multiple modules.

**Example**: Testing job queue with database

```typescript
test("queue processes jobs from database", async (t) => {
  const db = await createDatabase();
  const queue = new JobQueue({ database: db });
  // ... test queue processing
});
```

### 3. End-to-End Tests

Test complete workflows from start to finish.

**Example**: API endpoint test

```typescript
test("POST /api/runs executes backtest", async (t) => {
  const app = await createServer();
  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: backtestRequest,
  });
  assert.equal(response.statusCode, 201);
});
```

## Best Practices

### 1. Test Naming

Use descriptive names that explain what is being tested:

✅ **Good**:

```typescript
test("calculateSharpe returns zero for empty points", () => {
  // ...
});
```

❌ **Bad**:

```typescript
test("test sharpe", () => {
  // ...
});
```

### 2. Arrange-Act-Assert Pattern

Structure tests with clear sections:

```typescript
test("example test", () => {
  // Arrange: Set up test data
  const input = createTestData();

  // Act: Execute the function
  const result = functionUnderTest(input);

  // Assert: Verify the result
  assert.equal(result, expectedValue);
});
```

### 3. Test Independence

Each test should be independent and not rely on other tests:

✅ **Good**: Each test creates its own data

```typescript
test("test 1", () => {
  const data = createData();
  // ...
});

test("test 2", () => {
  const data = createData();
  // ...
});
```

❌ **Bad**: Tests share state

```typescript
const sharedData = createData();

test("test 1", () => {
  modifyData(sharedData);
});

test("test 2", () => {
  // Depends on test 1's modifications
  assert.ok(sharedData.wasModified);
});
```

### 4. Edge Cases and Boundary Conditions

Test edge cases thoroughly:

```typescript
// Normal case
test("function handles normal input", () => {
  /* ... */
});

// Boundary cases
test("function handles empty input", () => {
  /* ... */
});
test("function handles null input", () => {
  /* ... */
});
test("function handles zero values", () => {
  /* ... */
});
test("function handles negative values", () => {
  /* ... */
});
test("function handles very large values", () => {
  /* ... */
});
```

### 5. Error Testing

Test both success and failure paths:

```typescript
test("function succeeds with valid input", () => {
  const result = functionUnderTest(validInput);
  assert.ok(result);
});

test("function throws on invalid input", () => {
  assert.throws(
    () => {
      functionUnderTest(invalidInput);
    },
    { message: /expected error/ },
  );
});
```

## Known Issues

### Metrics Package Failures

Three tests in the metrics package currently fail:

1. **calculateSharpe computes positive value for increasing equity**
   - Expected a positive Sharpe ratio for increasing equity
   - May need more data points or adjusted annualization

2. **calculateMaxDrawdown handles multiple drawdowns**
   - Discrepancy in expected vs actual max drawdown calculation
   - Needs review of peak tracking logic

3. **calculateCagr computes positive value for growth**
   - CAGR calculation doesn't match expected value
   - May be precision issues with year calculation

See `TEST_RESULTS.md` for detailed information about these failures.

## Continuous Integration

### GitHub Actions (Planned)

A GitHub Actions workflow will be set up to:

1. Run all tests on every push
2. Run all tests on pull requests
3. Prevent merging if tests fail
4. Generate test coverage reports

### Pre-commit Hooks

Tests should be run before committing (can be added to `.husky/pre-commit`):

```bash
#!/bin/sh
pnpm test
```

## Debugging Tests

### Run a Single Test File

```bash
node --loader ts-node/esm --test path/to/test.test.ts
```

### Run with Verbose Output

```typescript
// Add this to see console output during tests
test("my test", () => {
  console.log("debug info");
  // ... test code
});
```

### Use Debugger

```typescript
test("debug test", () => {
  debugger; // Will pause here if running with debugger
  // ... test code
});
```

Run with debugger:

```bash
node --inspect-brk --loader ts-node/esm --test path/to/test.test.ts
```

## Test Metrics

### Current Statistics

- **Total Test Files**: 15+
- **Total Tests**: 200+
- **Pass Rate**: ~98.5% (3 known failures out of ~200 tests)
- **Average Execution Time**: < 1 second per test file

### Coverage Goals

Target coverage for Phase 0:

- **Unit Tests**: 90%+ coverage of core logic
- **Integration Tests**: All critical paths covered
- **E2E Tests**: All user-facing features covered

## Contributing

When adding new code:

1. **Write tests first** (TDD approach recommended)
2. **Test all paths**: Success and failure cases
3. **Test edge cases**: Null, empty, zero, negative, very large values
4. **Add descriptive test names**: Explain what is being tested
5. **Keep tests independent**: No shared state between tests
6. **Clean up resources**: Use `t.after()` for cleanup

## Resources

- [Node.js Test Runner Documentation](https://nodejs.org/api/test.html)
- [Node.js Assert Documentation](https://nodejs.org/api/assert.html)
- [ts-node Documentation](https://typestrong.org/ts-node/)
