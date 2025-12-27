/**
 * Comprehensive strategy validation module
 *
 * Ensures custom strategies meet all requirements before being saved
 * and can be successfully loaded by the backtest engine.
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  line?: number;
}

export interface StrategyMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
}

export interface ConfigSchemaField {
  type: "number" | "string" | "boolean";
  label: string;
  default: number | string | boolean;
  min?: number;
  max?: number;
  description?: string;
}

export type ConfigSchema = Record<string, ConfigSchemaField>;

/**
 * Validates a strategy code string for correctness
 */
export function validateStrategy(code: string, strategyName?: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Basic validation
  if (!code || code.trim().length === 0) {
    errors.push({
      code: "EMPTY_CODE",
      message: "Strategy code cannot be empty",
      suggestion: "Write your strategy implementation or use a template",
    });
    return { valid: false, errors, warnings };
  }

  // 2. Check for required exports
  const hasMetadataExport = validateMetadataExport(code, errors);
  const hasCreateStrategyExport = validateCreateStrategyExport(code, errors);

  // 3. Validate metadata object structure (if metadata export exists)
  if (hasMetadataExport) {
    validateMetadataStructure(code, errors, warnings);
  }

  // If both exports are missing, we can't continue with further validation
  if (!hasMetadataExport && !hasCreateStrategyExport) {
    return { valid: false, errors, warnings };
  }

  // 4. Validate createStrategy function signature (if createStrategy export exists)
  if (hasCreateStrategyExport) {
    validateCreateStrategySignature(code, errors, warnings);
  }

  // 5. Validate configSchema if present
  validateConfigSchema(code, errors, warnings);

  // 6. Check for common TypeScript syntax issues
  validateTypeScriptSyntax(code, errors, warnings);

  // 7. Validate strategy name consistency
  if (strategyName) {
    validateStrategyNameConsistency(code, strategyName, warnings);
  }

  // 8. Check for security issues
  validateSecurity(code, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates that metadata export exists
 */
function validateMetadataExport(code: string, errors: ValidationError[]): boolean {
  const metadataRegex = /export\s+const\s+metadata\s*=/;

  if (!metadataRegex.test(code)) {
    errors.push({
      code: "MISSING_METADATA_EXPORT",
      message: "Strategy must export a 'metadata' constant",
      suggestion: "Add: export const metadata = { name: '...', description: '...' };",
    });
    return false;
  }

  return true;
}

/**
 * Validates that createStrategy export exists
 */
function validateCreateStrategyExport(code: string, errors: ValidationError[]): boolean {
  const createStrategyRegex = /export\s+function\s+createStrategy/;

  if (!createStrategyRegex.test(code)) {
    errors.push({
      code: "MISSING_CREATE_STRATEGY_EXPORT",
      message: "Strategy must export a 'createStrategy' function",
      suggestion:
        "Add: export function createStrategy(config: any) { return { onBar: () => null }; }",
    });
    return false;
  }

  return true;
}

/**
 * Validates metadata object structure
 */
function validateMetadataStructure(
  code: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  // Extract metadata object content
  const metadataMatch = code.match(/export\s+const\s+metadata\s*=\s*\{([\s\S]*?)\};/);

  if (!metadataMatch) {
    errors.push({
      code: "INVALID_METADATA_SYNTAX",
      message: "Invalid metadata object syntax - must be: export const metadata = { ... };",
      suggestion: "Ensure metadata object is properly closed with }; and has correct syntax",
    });
    return;
  }

  const metadataContent = metadataMatch[1];

  // Required fields
  const nameMatch = metadataContent.match(/name:\s*(?:["']([^"']*?)["']|`([^`]*?)`)/);
  if (!nameMatch) {
    errors.push({
      code: "MISSING_METADATA_NAME",
      message: "Metadata must include a 'name' field",
      suggestion: "Add: name: 'My Strategy Name',",
    });
  } else {
    const name = nameMatch[1] || nameMatch[2] || "";
    if (name.trim().length === 0) {
      errors.push({
        code: "EMPTY_METADATA_NAME",
        message: "Metadata 'name' field cannot be empty",
        suggestion: "Provide a descriptive name for your strategy",
      });
    }
    if (name.length > 100) {
      errors.push({
        code: "METADATA_NAME_TOO_LONG",
        message: "Metadata 'name' field must be 100 characters or less",
        suggestion: "Shorten the strategy name",
      });
    }
  }

  const descMatch = metadataContent.match(/description:\s*(?:["']([^"']*?)["']|`([^`]*?)`)/);
  if (!descMatch) {
    errors.push({
      code: "MISSING_METADATA_DESCRIPTION",
      message: "Metadata must include a 'description' field",
      suggestion: "Add: description: 'A brief description of what this strategy does',",
    });
  } else {
    const desc = descMatch[1] || descMatch[2] || "";
    if (desc.trim().length === 0) {
      errors.push({
        code: "EMPTY_METADATA_DESCRIPTION",
        message: "Metadata 'description' field cannot be empty",
        suggestion: "Provide a brief description of your strategy",
      });
    }
    if (desc.length < 10) {
      warnings.push({
        code: "SHORT_DESCRIPTION",
        message: "Description is very short - consider adding more details",
      });
    }
  }

  // Optional fields validation
  const versionMatch = metadataContent.match(/version:\s*["']([^"']+)["']/);
  if (versionMatch) {
    const version = versionMatch[1];
    // Validate semantic versioning format
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      warnings.push({
        code: "INVALID_VERSION_FORMAT",
        message: "Version should follow semantic versioning (e.g., '1.0.0')",
      });
    }
  }

  // Check for tags array
  const tagsMatch = metadataContent.match(/tags:\s*\[([\s\S]*?)\]/);
  if (tagsMatch) {
    const tagsContent = tagsMatch[1];
    const tags = tagsContent.split(",").map((t) => t.trim().replace(/["']/g, ""));

    if (tags.length === 0 || (tags.length === 1 && tags[0] === "")) {
      warnings.push({
        code: "EMPTY_TAGS_ARRAY",
        message: "Tags array is empty - consider adding relevant tags",
      });
    }

    tags.forEach((tag) => {
      if (tag && tag.length > 50) {
        warnings.push({
          code: "TAG_TOO_LONG",
          message: `Tag '${tag.substring(0, 20)}...' is too long (max 50 characters)`,
        });
      }
    });
  }
}

/**
 * Validates createStrategy function signature
 */
function validateCreateStrategySignature(
  code: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  // Match: export function createStrategy(...) { ... }
  const funcMatch = code.match(/export\s+function\s+createStrategy\s*\(([^)]*)\)\s*\{/);

  if (!funcMatch) {
    errors.push({
      code: "INVALID_CREATE_STRATEGY_SYNTAX",
      message: "createStrategy function has invalid syntax",
      suggestion: "Must be: export function createStrategy(config: any) { ... }",
    });
    return;
  }

  const params = funcMatch[1].trim();

  // Should have at least one parameter (config)
  if (!params || params.length === 0) {
    warnings.push({
      code: "MISSING_CONFIG_PARAMETER",
      message: "createStrategy should accept a config parameter",
    });
  }

  // Check for return statement
  const funcBody = extractFunctionBody(code, "createStrategy");
  if (funcBody) {
    // Must return an object with at least onBar method
    if (!funcBody.includes("onBar")) {
      errors.push({
        code: "MISSING_ONBAR_METHOD",
        message: "createStrategy must return an object with an 'onBar' method",
        suggestion: "Return: { onBar: (context, bar) => { ... } }",
      });
    }

    // Check for return statement
    if (!funcBody.includes("return")) {
      errors.push({
        code: "MISSING_RETURN_STATEMENT",
        message: "createStrategy function must return a strategy object",
        suggestion: "Add: return { onBar: (context, bar) => null };",
      });
    }

    // Check for optional methods
    if (!funcBody.includes("onInit") && !funcBody.includes("onStop")) {
      warnings.push({
        code: "NO_LIFECYCLE_METHODS",
        message: "Strategy doesn't implement onInit or onStop lifecycle methods",
      });
    }
  }
}

/**
 * Validates configSchema if present
 */
function validateConfigSchema(
  code: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const configSchemaMatch = code.match(/export\s+const\s+configSchema\s*=\s*\{([\s\S]*?)\};/);

  if (!configSchemaMatch) {
    // configSchema is optional
    return;
  }

  const schemaContent = configSchemaMatch[1];

  // Parse individual fields
  const fieldPattern = /(\w+):\s*\{([^}]+)\}/g;
  const fieldMatches = [...schemaContent.matchAll(fieldPattern)];

  if (fieldMatches.length === 0) {
    warnings.push({
      code: "EMPTY_CONFIG_SCHEMA",
      message: "configSchema is defined but empty",
    });
    return;
  }

  fieldMatches.forEach((match) => {
    const fieldName = match[1];
    const fieldContent = match[2];

    // Required fields for each config field
    const typeMatch = fieldContent.match(/type:\s*["'](\w+)["']/);
    const labelMatch = fieldContent.match(/label:\s*["']([^"']+)["']/);
    const defaultMatch = fieldContent.match(/default:\s*([^,\n]+)/);

    if (!typeMatch) {
      errors.push({
        code: "MISSING_FIELD_TYPE",
        message: `Config field '${fieldName}' is missing required 'type' property`,
        suggestion: "Add: type: 'number' | 'string' | 'boolean'",
      });
    } else {
      const type = typeMatch[1];
      if (!["number", "string", "boolean"].includes(type)) {
        errors.push({
          code: "INVALID_FIELD_TYPE",
          message: `Config field '${fieldName}' has invalid type '${type}'`,
          suggestion: "Type must be one of: 'number', 'string', 'boolean'",
        });
      }
    }

    if (!labelMatch) {
      errors.push({
        code: "MISSING_FIELD_LABEL",
        message: `Config field '${fieldName}' is missing required 'label' property`,
        suggestion: "Add: label: 'Field Label'",
      });
    }

    if (!defaultMatch) {
      errors.push({
        code: "MISSING_FIELD_DEFAULT",
        message: `Config field '${fieldName}' is missing required 'default' property`,
        suggestion: "Add: default: <value>",
      });
    }

    // Validate min/max for number types
    const minMatch = fieldContent.match(/min:\s*(\d+)/);
    const maxMatch = fieldContent.match(/max:\s*(\d+)/);

    if (typeMatch && typeMatch[1] === "number") {
      if (minMatch && maxMatch) {
        const min = parseInt(minMatch[1]);
        const max = parseInt(maxMatch[1]);
        if (min >= max) {
          errors.push({
            code: "INVALID_MIN_MAX_RANGE",
            message: `Config field '${fieldName}': min (${min}) must be less than max (${max})`,
            suggestion: "Ensure min < max",
          });
        }
      }
    } else {
      if (minMatch || maxMatch) {
        warnings.push({
          code: "MIN_MAX_NON_NUMBER",
          message: `Config field '${fieldName}': min/max only applicable for 'number' type`,
        });
      }
    }
  });
}

/**
 * Validates TypeScript syntax
 */
function validateTypeScriptSyntax(
  code: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  // Check for common syntax errors

  // Unclosed braces
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push({
      code: "UNMATCHED_BRACES",
      message: `Unmatched braces: ${openBraces} opening, ${closeBraces} closing`,
      suggestion: "Ensure all { are matched with }",
    });
  }

  // Unclosed parentheses
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    errors.push({
      code: "UNMATCHED_PARENTHESES",
      message: `Unmatched parentheses: ${openParens} opening, ${closeParens} closing`,
      suggestion: "Ensure all ( are matched with )",
    });
  }

  // Unclosed brackets
  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;

  if (openBrackets !== closeBrackets) {
    errors.push({
      code: "UNMATCHED_BRACKETS",
      message: `Unmatched brackets: ${openBrackets} opening, ${closeBrackets} closing`,
      suggestion: "Ensure all [ are matched with ]",
    });
  }

  // Check for invalid characters
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/.test(code)) {
    warnings.push({
      code: "INVALID_CHARACTERS",
      message: "Code contains invalid control characters",
    });
  }

  // Check for arrow function syntax issues
  const arrowFunctions = code.match(/=>\s*\{[^}]*$/gm);
  if (arrowFunctions && arrowFunctions.length > 0) {
    warnings.push({
      code: "POSSIBLE_UNCLOSED_ARROW_FUNCTION",
      message: "Possible unclosed arrow function - check your function bodies",
    });
  }
}

/**
 * Validates strategy name consistency
 */
function validateStrategyNameConsistency(
  code: string,
  strategyName: string,
  warnings: ValidationWarning[],
): void {
  const metadataMatch = code.match(/export\s+const\s+metadata\s*=\s*\{([\s\S]*?)\};/);

  if (metadataMatch) {
    const metadataContent = metadataMatch[1];
    const nameMatch = metadataContent.match(/name:\s*["']([^"']+)["']/);

    if (nameMatch && nameMatch[1]) {
      const metadataName = nameMatch[1];
      const normalizedStrategyName = strategyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const normalizedMetadataName = metadataName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      if (normalizedStrategyName !== normalizedMetadataName) {
        warnings.push({
          code: "NAME_MISMATCH",
          message: `Strategy filename '${strategyName}' doesn't match metadata name '${metadataName}'`,
        });
      }
    }
  }
}

/**
 * Validates security concerns
 */
function validateSecurity(
  code: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  // Check for dangerous patterns

  if (code.includes("eval(")) {
    errors.push({
      code: "FORBIDDEN_EVAL",
      message: "Use of eval() is forbidden for security reasons",
      suggestion: "Refactor your code to avoid eval()",
    });
  }

  if (code.includes("Function(")) {
    errors.push({
      code: "FORBIDDEN_FUNCTION_CONSTRUCTOR",
      message: "Use of Function constructor is forbidden for security reasons",
      suggestion: "Use regular function declarations instead",
    });
  }

  // Warn about file system access
  if (
    code.includes("fs.") ||
    code.includes("require('fs')") ||
    code.includes('require("fs")') ||
    /import\s+.*\bfs\b.*\s+from/.test(code)
  ) {
    warnings.push({
      code: "FILE_SYSTEM_ACCESS",
      message: "Strategy appears to access the file system - this may not work in all environments",
    });
  }

  // Warn about network access
  if (code.includes("fetch(") || code.includes("XMLHttpRequest") || code.includes("http.")) {
    warnings.push({
      code: "NETWORK_ACCESS",
      message: "Strategy appears to make network requests - this may not work in all environments",
    });
  }

  // Warn about process access
  if (code.includes("process.")) {
    warnings.push({
      code: "PROCESS_ACCESS",
      message: "Strategy accesses process object - be cautious with environment-specific code",
    });
  }
}

/**
 * Helper: Extract function body
 */
function extractFunctionBody(code: string, functionName: string): string | null {
  const regex = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`, "");
  const match = code.match(regex);

  if (!match) {
    return null;
  }

  const startIndex = match.index! + match[0].length;
  let braceCount = 1;
  let endIndex = startIndex;

  // Find the matching closing brace by counting nested braces
  for (let i = startIndex; i < code.length && braceCount > 0; i++) {
    if (code[i] === "{") {
      braceCount++;
    } else if (code[i] === "}") {
      braceCount--;
    }
    endIndex = i;
  }

  if (braceCount !== 0) {
    return null; // Unmatched braces
  }

  return code.substring(startIndex, endIndex);
}

/**
 * Format validation results as user-friendly messages
 */
export function formatValidationResults(result: ValidationResult): {
  errorMessages: string[];
  warningMessages: string[];
} {
  const errorMessages = result.errors.map((error) => {
    let msg = `[${error.code}] ${error.message}`;
    if (error.suggestion) {
      msg += `\n  → suggestion: ${error.suggestion}`;
    }
    if (error.line !== undefined) {
      msg += ` (line ${error.line})`;
    }
    return msg;
  });

  const warningMessages = result.warnings.map((warning) => {
    let msg = `[${warning.code}] ${warning.message}`;
    if (warning.line !== undefined) {
      msg += ` (line ${warning.line})`;
    }
    return msg;
  });

  return { errorMessages, warningMessages };
}
