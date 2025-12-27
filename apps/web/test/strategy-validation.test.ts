import test from "node:test";
import assert from "node:assert/strict";
import { validateStrategy, formatValidationResults } from "../src/lib/strategy-validation.js";

// ============================================================================
// Valid Strategy Tests
// ============================================================================

test("validates a minimal valid strategy", () => {
  const code = `
export const metadata = {
  name: "Test Strategy",
  description: "A test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, true, "Should be valid");
  assert.equal(result.errors.length, 0, "Should have no errors");
});

test("validates a complete valid strategy with all fields", () => {
  const code = `
export const metadata = {
  name: "Advanced Test Strategy",
  description: "A comprehensive test strategy with all metadata fields",
  version: "1.0.0",
  author: "Test Author",
  tags: ["momentum", "trend-following"],
};

export const configSchema = {
  period: {
    type: "number",
    label: "Period",
    default: 20,
    min: 1,
    max: 100,
    description: "Lookback period for calculations",
  },
  threshold: {
    type: "number",
    label: "Threshold",
    default: 0.5,
  },
};

export function createStrategy(config: any) {
  return {
    onInit: (context: any) => {
      console.log("Strategy initialized");
    },
    onBar: (context: any, bar: any) => {
      return null;
    },
    onStop: (context: any) => {
      return null;
    },
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, true, "Should be valid");
  assert.equal(result.errors.length, 0, "Should have no errors");
});

test("validates strategy with configSchema", () => {
  const code = `
export const metadata = {
  name: "Config Test",
  description: "Strategy with configuration schema",
};

export const configSchema = {
  buyThreshold: {
    type: "number",
    label: "Buy Threshold",
    default: 0.7,
    min: 0,
    max: 1,
  },
  sellThreshold: {
    type: "number",
    label: "Sell Threshold",
    default: 0.3,
    min: 0,
    max: 1,
  },
  enableFilter: {
    type: "boolean",
    label: "Enable Filter",
    default: true,
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, true, "Should be valid");
  assert.equal(result.errors.length, 0, "Should have no errors");
});

// ============================================================================
// Empty/Missing Code Tests
// ============================================================================

test("rejects empty code", () => {
  const result = validateStrategy("");
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, "EMPTY_CODE");
});

test("rejects whitespace-only code", () => {
  const result = validateStrategy("   \n  \t  ");
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, "EMPTY_CODE");
});

// ============================================================================
// Missing Export Tests
// ============================================================================

test("rejects strategy missing metadata export", () => {
  const code = `
export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_METADATA_EXPORT"));
});

test("rejects strategy missing createStrategy export", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_CREATE_STRATEGY_EXPORT"));
});

test("rejects strategy missing both exports", () => {
  const code = `
const someCode = "hello world";
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_METADATA_EXPORT"));
  assert.ok(result.errors.some((e) => e.code === "MISSING_CREATE_STRATEGY_EXPORT"));
});

// ============================================================================
// Metadata Structure Tests
// ============================================================================

test("rejects metadata missing name field", () => {
  const code = `
export const metadata = {
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_METADATA_NAME"));
});

test("rejects metadata missing description field", () => {
  const code = `
export const metadata = {
  name: "Test Strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_METADATA_DESCRIPTION"));
});

test("rejects metadata with empty name", () => {
  const code = `
export const metadata = {
  name: "",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "EMPTY_METADATA_NAME"));
});

test("rejects metadata with empty description", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "EMPTY_METADATA_DESCRIPTION"));
});

test("rejects metadata with name too long", () => {
  const longName = "A".repeat(101);
  const code = `
export const metadata = {
  name: "${longName}",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "METADATA_NAME_TOO_LONG"));
});

test("warns about short description", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Short",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "SHORT_DESCRIPTION"));
});

test("warns about invalid version format", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
  version: "v1.0",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "INVALID_VERSION_FORMAT"));
});

// ============================================================================
// createStrategy Function Tests
// ============================================================================

test("rejects createStrategy missing onBar method", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onInit: () => {},
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_ONBAR_METHOD"));
});

test("rejects createStrategy missing return statement", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  const onBar = (context: any, bar: any) => null;
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_RETURN_STATEMENT"));
});

test("warns about missing lifecycle methods", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "NO_LIFECYCLE_METHODS"));
});

test("warns about missing config parameter", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy() {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "MISSING_CONFIG_PARAMETER"));
});

// ============================================================================
// ConfigSchema Tests
// ============================================================================

test("warns about empty configSchema", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "EMPTY_CONFIG_SCHEMA"));
});

test("rejects configSchema field missing type", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {
  period: {
    label: "Period",
    default: 20,
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_FIELD_TYPE"));
});

test("rejects configSchema field missing label", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {
  period: {
    type: "number",
    default: 20,
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_FIELD_LABEL"));
});

test("rejects configSchema field missing default", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {
  period: {
    type: "number",
    label: "Period",
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "MISSING_FIELD_DEFAULT"));
});

test("rejects configSchema field with invalid type", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {
  period: {
    type: "integer",
    label: "Period",
    default: 20,
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "INVALID_FIELD_TYPE"));
});

test("rejects configSchema field with min >= max", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {
  period: {
    type: "number",
    label: "Period",
    default: 20,
    min: 100,
    max: 10,
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "INVALID_MIN_MAX_RANGE"));
});

test("warns about min/max on non-number field", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export const configSchema = {
  name: {
    type: "string",
    label: "Name",
    default: "test",
    min: 0,
    max: 10,
  },
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "MIN_MAX_NON_NUMBER"));
});

// ============================================================================
// Syntax Tests
// ============================================================================

test("rejects code with unmatched braces", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "UNMATCHED_BRACES"));
});

test("rejects code with unmatched parentheses", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "UNMATCHED_PARENTHESES"));
});

test("rejects code with unmatched brackets", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
  tags: ["test", "strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "UNMATCHED_BRACKETS"));
});

// ============================================================================
// Security Tests
// ============================================================================

test("rejects code with eval()", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  eval("console.log('dangerous')");
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "FORBIDDEN_EVAL"));
});

test("rejects code with Function constructor", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  const fn = new Function("return 1");
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "FORBIDDEN_FUNCTION_CONSTRUCTOR"));
});

test("warns about file system access", () => {
  const code = `
import fs from "fs";

export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "FILE_SYSTEM_ACCESS"));
});

test("warns about network access", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => {
      fetch("https://api.example.com/data");
      return null;
    },
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "NETWORK_ACCESS"));
});

test("warns about process access", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  console.log(process.env.NODE_ENV);
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.ok(result.warnings.some((w) => w.code === "PROCESS_ACCESS"));
});

// ============================================================================
// Name Consistency Tests
// ============================================================================

test("warns about strategy name mismatch", () => {
  const code = `
export const metadata = {
  name: "Different Strategy Name",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code, "my-strategy");
  assert.ok(result.warnings.some((w) => w.code === "NAME_MISMATCH"));
});

test("does not warn when strategy names match", () => {
  const code = `
export const metadata = {
  name: "My Strategy",
  description: "Test strategy",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code, "my-strategy");
  const nameMismatchWarning = result.warnings.find((w) => w.code === "NAME_MISMATCH");
  assert.equal(nameMismatchWarning, undefined);
});

// ============================================================================
// Format Results Tests
// ============================================================================

test("formatValidationResults formats errors correctly", () => {
  const code = `
export const metadata = {
  name: "",
  description: "",
};
  `;

  const result = validateStrategy(code);
  const formatted = formatValidationResults(result);

  assert.ok(formatted.errorMessages.length > 0);
  assert.ok(formatted.errorMessages.some((msg) => msg.includes("EMPTY_METADATA_NAME")));
  assert.ok(formatted.errorMessages.some((msg) => msg.includes("suggestion")));
});

test("formatValidationResults formats warnings correctly", () => {
  const code = `
export const metadata = {
  name: "Test",
  description: "Short",
  version: "1.0",
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  const formatted = formatValidationResults(result);

  assert.ok(formatted.warningMessages.length > 0);
  assert.ok(formatted.warningMessages.some((msg) => msg.includes("SHORT_DESCRIPTION")));
});

// ============================================================================
// Complex Validation Scenarios
// ============================================================================

test("handles multiple errors correctly", () => {
  const code = `
export const metadata = {
};

export function createStrategy() {
  const x = 1;
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3); // Missing name, description, return, etc.
});

test("validates strategy with multiline strings", () => {
  const code = `
export const metadata = {
  name: "Test Strategy",
  description: \`This is a longer description
    that spans multiple lines
    to provide comprehensive information\`,
};

export function createStrategy(config: any) {
  return {
    onBar: (context: any, bar: any) => null,
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, true);
});

test("validates strategy with complex nested structures", () => {
  const code = `
export const metadata = {
  name: "Complex Strategy",
  description: "A strategy with complex structure",
};

export function createStrategy(config: any) {
  const state = {
    value: 0,
    nested: {
      deep: {
        property: true,
      },
    },
  };

  return {
    onInit: (context: any) => {
      state.value = 100;
    },
    onBar: (context: any, bar: any) => {
      if (state.nested.deep.property) {
        return {
          side: "buy",
          timestamp: bar.timestamp,
          reason: "test",
        };
      }
      return null;
    },
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, true);
});

test("validates strategy with comments", () => {
  const code = `
// This is a comment
export const metadata = {
  name: "Test Strategy",
  description: "Test with comments",
};

/**
 * Create strategy function
 * @param config Configuration object
 */
export function createStrategy(config: any) {
  // Initialize state
  return {
    onBar: (context: any, bar: any) => {
      // Process bar
      return null;
    },
  };
}
  `;

  const result = validateStrategy(code);
  assert.equal(result.valid, true);
});
