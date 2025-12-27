import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { cwd } from "process";

// In Next.js, cwd() returns the project root
const REPO_ROOT = cwd();
const STRATEGIES_DIR = join(REPO_ROOT, "storage", "strategies", "custom");

interface StrategyMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
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
}

/**
 * Extract metadata from strategy code using regex (simple parser).
 */
function extractMetadata(code: string): Partial<StrategyMetadata> | null {
  try {
    // Match: export const metadata = { ... }
    const metadataMatch = code.match(/export\s+const\s+metadata\s*=\s*\{([^}]+)\}/s);

    if (!metadataMatch || !metadataMatch[1]) {
      return null;
    }

    const metadataContent = metadataMatch[1];
    const metadata: Partial<StrategyMetadata> = {};

    // Extract individual fields
    const nameMatch = metadataContent.match(/name:\s*["']([^"']+)["']/);
    const descMatch = metadataContent.match(/description:\s*["']([^"']+)["']/);
    const versionMatch = metadataContent.match(/version:\s*["']([^"']+)["']/);
    const authorMatch = metadataContent.match(/author:\s*["']([^"']+)["']/);
    const tagsMatch = metadataContent.match(/tags:\s*\[([^\]]+)\]/);

    if (nameMatch?.[1]) metadata.name = nameMatch[1];
    if (descMatch?.[1]) metadata.description = descMatch[1];
    if (versionMatch?.[1]) metadata.version = versionMatch[1];
    if (authorMatch?.[1]) metadata.author = authorMatch[1];
    if (tagsMatch?.[1]) {
      metadata.tags = tagsMatch[1].split(",").map((tag) => tag.trim().replace(/["']/g, ""));
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
 * GET /api/strategies
 * List all custom strategies
 */
export async function GET() {
  try {
    // Ensure directory exists
    await mkdir(STRATEGIES_DIR, { recursive: true });

    // Read all .ts files in the directory
    const files = await readdir(STRATEGIES_DIR);
    const strategyFiles = files.filter((f) => f.endsWith(".ts") && f !== "README.md");

    const strategies: Strategy[] = [];

    for (const filename of strategyFiles) {
      try {
        const filePath = join(STRATEGIES_DIR, filename);
        const code = await readFile(filePath, "utf-8");
        const metadata = extractMetadata(code);

        if (metadata && metadata.name) {
          strategies.push({
            id: filenameToId(filename),
            name: metadata.name,
            description: metadata.description || "No description",
            type: "custom",
            version: metadata.version,
            author: metadata.author,
            tags: metadata.tags,
            filename,
          });
        }
      } catch (error) {
        console.error(`Error reading strategy ${filename}:`, error);
      }
    }

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

    // Validate code contains required exports
    if (!code.includes("export const metadata")) {
      return NextResponse.json(
        { error: "Strategy must export 'metadata' object" },
        { status: 400 },
      );
    }

    if (!code.includes("export function createStrategy")) {
      return NextResponse.json(
        { error: "Strategy must export 'createStrategy' function" },
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
