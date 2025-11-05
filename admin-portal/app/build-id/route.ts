import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    const id = (await fs.readFile(buildIdPath, "utf8")).trim();
    return new Response(id + "\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return new Response("unknown\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
