import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { cwd } from "process";
import { validateStrategy, formatValidationResults } from "../../../lib/strategy-validation";

// In Next.js, cwd() returns the Next.js app root, but we need the monorepo root
// Go up two levels: apps/web -> apps -> monorepo root
const REPO_ROOT = resolve(cwd(), "..", "..");
const STRATEGIES_DIR = resolve(REPO_ROOT, "storage", "strategies", "custom");
console.log(`[API] cwd() = ${cwd()}`);
console.log(`[API] REPO_ROOT = ${REPO_ROOT}`);
console.log(`[API] STRATEGIES_DIR = ${STRATEGIES_DIR}`);

interface StrategyMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  configSchema?: Record<
    string,
    {
      type: "number" | "string" | "boolean";
      label: string;
      default: number | string | boolean;
      min?: number;
      max?: number;
      description?: string;
    }
  >;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  type: "custom";
  version?: string;
  author?: string;
  tags?: string[];
  filename: string;
  configSchema?: StrategyMetadata["configSchema"];
  favorite?: boolean;
}

interface StrategyMeta {
  favorite: boolean;
}

/**
 * Extract metadata from strategy code using regex (simple parser).
 */
function extractMetadata(code: string): Partial<StrategyMetadata> | null {
  try {
    console.log(`[API extractMetadata] Code length: ${code.length} bytes`);
    // Match: export const metadata = { ... }
    // Use lazy matching and handle nested braces
    const metadataMatch = code.match(/export\s+const\s+metadata\s*=\s*\{([\s\S]*?)\};/);

    console.log("[API extractMetadata] Testing regex match...");
    console.log("[API extractMetadata] Match found:", !!metadataMatch);
    console.log("[API extractMetadata] First 200 chars of code:", code.substring(0, 200));

    if (!metadataMatch || !metadataMatch[1]) {
      console.log("[API] Failed to extract metadata object");
      return null;
    }

    const metadataContent = metadataMatch[1];
    const metadata: Partial<StrategyMetadata> = {};

    // Extract individual fields - handle multi-line strings with \s* for whitespace/newlines
    const nameMatch = metadataContent.match(/name:\s*["']([^"']+)["']/);
    const descMatch = metadataContent.match(/description:\s*["']([^"']+)["']/s);
    const versionMatch = metadataContent.match(/version:\s*["']([^"']+)["']/);
    const authorMatch = metadataContent.match(/author:\s*["']([^"']+)["']/);
    const tagsMatch = metadataContent.match(/tags:\s*\[([\s\S]*?)\]/);

    if (nameMatch?.[1]) metadata.name = nameMatch[1];
    if (descMatch?.[1]) metadata.description = descMatch[1];
    if (versionMatch?.[1]) metadata.version = versionMatch[1];
    if (authorMatch?.[1]) metadata.author = authorMatch[1];
    if (tagsMatch?.[1]) {
      metadata.tags = tagsMatch[1].split(",").map((tag) => tag.trim().replace(/["']/g, ""));
    }

    // Extract configSchema
    const configSchemaMatch = code.match(/export\s+const\s+configSchema\s*=\s*\{([\s\S]*?)\};/);
    console.log(`[API] configSchemaMatch found:`, !!configSchemaMatch);

    if (configSchemaMatch?.[1]) {
      try {
        console.log(`[API] Parsing configSchema content...`);
        const schemaContent = configSchemaMatch[1];
        console.log(`[API] Schema content length:`, schemaContent.length);
        console.log(`[API] Schema content preview:`, schemaContent.substring(0, 100));

        // Use more robust regex that handles nested content better
        // Match pattern: fieldName: { ... },
        const fieldPattern = /(\w+):\s*\{([^}]+)\}/g;
        const fieldMatches = [...schemaContent.matchAll(fieldPattern)];

        console.log(`[API] Found ${fieldMatches.length} field matches`);

        const schema: Record<
          string,
          {
            type: string;
            label: string;
            default: string | number;
            min?: number;
            max?: number;
            description?: string;
          }
        > = {};

        for (const match of fieldMatches) {
          const fieldName = match[1];
          const fieldContent = match[2];

          console.log(`[API] Processing field: ${fieldName}`);
          console.log(`[API] Field content:`, fieldContent);

          const typeMatch = fieldContent.match(/type:\s*"(\w+)"/);
          const labelMatch = fieldContent.match(/label:\s*"([^"]+)"/);
          const defaultMatch = fieldContent.match(/default:\s*([^,\n]+)/);
          const minMatch = fieldContent.match(/min:\s*(\d+)/);
          const maxMatch = fieldContent.match(/max:\s*(\d+)/);
          const descriptionMatch = fieldContent.match(/description:\s*"([^"]+)"/);

          console.log(`[API] Parsed values:`, {
            type: typeMatch?.[1],
            label: labelMatch?.[1],
            default: defaultMatch?.[1],
            min: minMatch?.[1],
            max: maxMatch?.[1],
            description: descriptionMatch?.[1],
          });

          if (typeMatch && labelMatch && defaultMatch) {
            let defaultValue: string | number = defaultMatch[1].trim();

            // Try to parse as number if it looks like a number
            if (/^\d+(\.\d+)?$/.test(defaultValue)) {
              defaultValue = Number(defaultValue);
            }

            schema[fieldName] = {
              type: typeMatch[1],
              label: labelMatch[1],
              default: defaultValue,
            };

            if (minMatch) schema[fieldName].min = parseInt(minMatch[1]);
            if (maxMatch) schema[fieldName].max = parseInt(maxMatch[1]);
            if (descriptionMatch) schema[fieldName].description = descriptionMatch[1];

            console.log(`[API] ✓ Added field ${fieldName} to schema`);
          } else {
            console.log(`[API] ✗ Skipped field ${fieldName}: missing required fields`);
          }
        }

        if (Object.keys(schema).length > 0) {
          console.log(
            `[API] Setting configSchema with ${Object.keys(schema).length} fields:`,
            Object.keys(schema),
          );
          metadata.configSchema = schema;
        } else {
          console.log(`[API] No fields found in configSchema`);
        }
      } catch (error) {
        console.error("Error parsing configSchema:", error);
      }
    } else {
      console.log(`[API] No configSchemaMatch found`);
    }

    return metadata;
  } catch (error) {
    console.error("Error extracting metadata:", error);
    return null;
  }
}

/**
 * Convert filename to strategy ID.
 */
function filenameToId(filename: string): string {
  return filename.replace(/\.ts$/, "");
}

/**
 * Convert strategy name to valid filename.
 */
function nameToFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Read strategy metadata file.
 */
async function readStrategyMeta(id: string): Promise<StrategyMeta> {
  const metaPath = join(STRATEGIES_DIR, `${id}.meta.json`);
  try {
    const content = await readFile(metaPath, "utf-8");
    return JSON.parse(content) as StrategyMeta;
  } catch {
    return { favorite: false };
  }
}

/**
 * GET /api/strategies
 * List all custom strategies
 */
export async function GET() {
  try {
    console.log(`[API GET] Starting - loading from: ${STRATEGIES_DIR}`);

    // Ensure directory exists
    await mkdir(STRATEGIES_DIR, { recursive: true });

    // Read all .ts files in the directory
    const files = await readdir(STRATEGIES_DIR);
    console.log(`[API] Found files:`, files);

    const strategyFiles = files.filter((f) => f.endsWith(".ts") && f !== "README.md");
    console.log(`[API] Strategy files to parse:`, strategyFiles);

    const strategies: Strategy[] = [];

    for (const filename of strategyFiles) {
      try {
        console.log(`[API] Processing file: ${filename}`);
        const filePath = join(STRATEGIES_DIR, filename);
        const code = await readFile(filePath, "utf-8");
        console.log(`[API] Read ${code.length} bytes from ${filename}`);
        const metadata = extractMetadata(code);

        console.log(`[API] Parsed metadata for ${filename}:`, JSON.stringify(metadata));

        if (metadata && metadata.name) {
          const id = filenameToId(filename);
          const meta = await readStrategyMeta(id);

          const strategy = {
            id,
            name: metadata.name,
            description: metadata.description || "No description",
            type: "custom" as const,
            version: metadata.version,
            author: metadata.author,
            tags: metadata.tags,
            filename,
            configSchema: metadata.configSchema,
            favorite: meta.favorite,
          };
          strategies.push(strategy);
          console.log(`[API] ✓ Added strategy: ${metadata.name}`);
        } else {
          console.log(`[API] ✗ Skipped ${filename}: missing metadata or name`);
        }
      } catch (error) {
        console.error(`[API] ✗ Error reading strategy ${filename}:`, error);
      }
    }

    console.log(`[API] Returning ${strategies.length} strategies`);
    return NextResponse.json(strategies);
  } catch (error) {
    console.error("Error listing strategies:", error);
    return NextResponse.json({ error: "Failed to list strategies" }, { status: 500 });
  }
}

/**
 * POST /api/strategies
 * Create a new strategy
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code } = body;

    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
    }

    // Run comprehensive validation
    const validationResult = validateStrategy(code, name);

    if (!validationResult.valid) {
      const formatted = formatValidationResults(validationResult);
      return NextResponse.json(
        {
          error: "Strategy validation failed",
          validationErrors: formatted.errorMessages,
          errors: validationResult.errors,
        },
        { status: 400 },
      );
    }

    // Generate filename from name
    const filename = `${nameToFilename(name)}.ts`;
    const filePath = join(STRATEGIES_DIR, filename);

    // Ensure directory exists
    await mkdir(STRATEGIES_DIR, { recursive: true });

    // Check if file already exists
    try {
      await readFile(filePath);
      return NextResponse.json(
        { error: "A strategy with this name already exists" },
        { status: 409 },
      );
    } catch {
      // File doesn't exist, which is what we want
    }

    // Write the file
    await writeFile(filePath, code, "utf-8");

    return NextResponse.json({
      success: true,
      id: filenameToId(filename),
      filename,
      path: filePath,
    });
  } catch (error) {
    console.error("Error creating strategy:", error);
    return NextResponse.json({ error: "Failed to create strategy" }, { status: 500 });
  }
}
