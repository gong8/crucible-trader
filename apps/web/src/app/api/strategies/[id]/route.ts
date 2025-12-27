import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, unlink } from "fs/promises";
import { join, resolve } from "path";
import { cwd } from "process";

// In Next.js, cwd() returns the Next.js app root, but we need the monorepo root
// Go up two levels: apps/web -> apps -> monorepo root
const REPO_ROOT = resolve(cwd(), "..", "..");
const STRATEGIES_DIR = resolve(REPO_ROOT, "storage", "strategies", "custom");

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/strategies/[id]
 * Get a single strategy's code
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const filename = `${params.id}.ts`;
    const filePath = join(STRATEGIES_DIR, filename);

    const code = await readFile(filePath, "utf-8");

    return NextResponse.json({
      id: params.id,
      code,
      filename,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    console.error("Error reading strategy:", error);
    return NextResponse.json({ error: "Failed to read strategy" }, { status: 500 });
  }
}

/**
 * PUT /api/strategies/[id]
 * Update an existing strategy
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
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

    const filename = `${params.id}.ts`;
    const filePath = join(STRATEGIES_DIR, filename);

    // Check if file exists
    try {
      await readFile(filePath);
    } catch {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Update the file
    await writeFile(filePath, code, "utf-8");

    return NextResponse.json({
      success: true,
      id: params.id,
      filename,
    });
  } catch (error) {
    console.error("Error updating strategy:", error);
    return NextResponse.json({ error: "Failed to update strategy" }, { status: 500 });
  }
}

/**
 * DELETE /api/strategies/[id]
 * Delete a strategy
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const filename = `${params.id}.ts`;
    const filePath = join(STRATEGIES_DIR, filename);

    // Delete the file
    await unlink(filePath);

    return NextResponse.json({
      success: true,
      id: params.id,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    console.error("Error deleting strategy:", error);
    return NextResponse.json({ error: "Failed to delete strategy" }, { status: 500 });
  }
}
