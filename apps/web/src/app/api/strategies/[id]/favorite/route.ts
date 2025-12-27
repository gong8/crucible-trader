import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { cwd } from "process";

const REPO_ROOT = resolve(cwd(), "..", "..");
const STRATEGIES_DIR = resolve(REPO_ROOT, "storage", "strategies", "custom");

interface RouteParams {
  params: {
    id: string;
  };
}

interface StrategyMeta {
  favorite: boolean;
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
 * Write strategy metadata file.
 */
async function writeStrategyMeta(id: string, meta: StrategyMeta): Promise<void> {
  await mkdir(STRATEGIES_DIR, { recursive: true });
  const metaPath = join(STRATEGIES_DIR, `${id}.meta.json`);
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

/**
 * POST /api/strategies/[id]/favorite
 * Toggle favorite status for a strategy
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Check if strategy file exists
    const strategyPath = join(STRATEGIES_DIR, `${params.id}.ts`);
    try {
      await readFile(strategyPath);
    } catch {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Read current metadata
    const meta = await readStrategyMeta(params.id);

    // Toggle favorite
    const newMeta: StrategyMeta = {
      favorite: !meta.favorite,
    };

    // Write updated metadata
    await writeStrategyMeta(params.id, newMeta);

    return NextResponse.json({
      success: true,
      favorite: newMeta.favorite,
    });
  } catch (error) {
    console.error("Error toggling strategy favorite:", error);
    return NextResponse.json({ error: "Failed to toggle favorite" }, { status: 500 });
  }
}
