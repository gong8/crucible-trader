/**
 * Shared types for MCP server tools.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool registration function type.
 */
export type RegisterTool = (
  name: string,
  description: string,
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] },
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
) => void;

/**
 * Helper to create a text content response.
 */
export function textContent(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}
