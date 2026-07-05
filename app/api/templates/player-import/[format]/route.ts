import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const templates = {
  csv: {
    contentType: "text/csv; charset=utf-8",
    filename: "player-import-template.csv"
  },
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: "player-import-template.xlsx"
  }
} as const;

type TemplateFormat = keyof typeof templates;

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ format: "csv" }, { format: "xlsx" }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (!isTemplateFormat(format)) {
    return NextResponse.json({ error: "Unknown template format." }, { status: 404 });
  }

  const template = templates[format];
  const filePath = path.join(process.cwd(), "public", template.filename);
  const file = await readFile(filePath);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Disposition": `attachment; filename="${template.filename}"`,
      "Content-Length": String(file.byteLength),
      "Content-Type": template.contentType
    }
  });
}

function isTemplateFormat(format: string): format is TemplateFormat {
  return format === "csv" || format === "xlsx";
}
