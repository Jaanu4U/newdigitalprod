import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { constants, promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_DOWNLOAD_DIR = path.join(process.cwd(), "public", "downloads");
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? DEFAULT_DOWNLOAD_DIR;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const rawName = params.file ?? "";
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "");

  if (!safeName || safeName.length !== rawName.length) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(DOWNLOADS_DIR, safeName);

  try {
    await fs.access(filePath, constants.R_OK);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stats = await fs.stat(filePath);
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream);

  return new NextResponse(webStream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": stats.size.toString(),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
