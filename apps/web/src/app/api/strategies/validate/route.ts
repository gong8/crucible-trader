import { NextRequest, NextResponse } from "next/server";
import { validateStrategy, formatValidationResults } from "../../../../lib/strategy-validation.js";

/**
 * POST /api/strategies/validate
 * Validates a strategy code without saving it
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name } = body;

    if (!code) {
      return NextResponse.json(
        {
          valid: false,
          errorMessages: ["Code is required"],
          warningMessages: [],
        },
        { status: 400 },
      );
    }

    // Run comprehensive validation
    const result = validateStrategy(code, name);
    const formatted = formatValidationResults(result);

    return NextResponse.json({
      valid: result.valid,
      errorMessages: formatted.errorMessages,
      warningMessages: formatted.warningMessages,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Error validating strategy:", error);
    return NextResponse.json(
      {
        valid: false,
        errorMessages: ["Internal validation error"],
        warningMessages: [],
      },
      { status: 500 },
    );
  }
}
