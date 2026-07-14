import * as XLSX from "xlsx";
import type { UserRole } from "./types";

export type PeopleImportRow = {
  fullName: string;
  email: string;
  password?: string;
  role: UserRole;
  rating?: string;
  mobileNumber?: string;
  createPlayerProfile: boolean;
};

const EXPECTED_COLUMNS = "full_name, email, mobile_number, role, password, rating, create_player_profile";

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  full_name: "fullName",
  fullname: "fullName",
  name: "fullName",
  email: "email",
  mobile_number: "mobileNumber",
  mobile: "mobileNumber",
  phone: "mobileNumber",
  role: "role",
  password: "password",
  rating: "rating",
  create_player_profile: "createPlayerProfile",
  createplayerprofile: "createPlayerProfile"
};

type RawRow = {
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  role?: string;
  password?: string;
  rating?: string;
  createPlayerProfile?: string;
};

export class PeopleImportError extends Error {}

export async function parsePeopleImportFile(file: File): Promise<PeopleImportRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const rawRows = ["xls", "xlsx"].includes(extension) ? await parseSpreadsheet(file) : await parseDelimited(file, extension);

  const rows = rawRows.map(normalizeRow).filter((row): row is PeopleImportRow => row !== null);

  if (rows.length === 0) {
    throw new PeopleImportError(`No people found. Use columns: ${EXPECTED_COLUMNS}.`);
  }

  return rows;
}

async function parseSpreadsheet(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return rows.map((row) => mapHeaders(row));
}

async function parseDelimited(file: File, extension: string): Promise<RawRow[]> {
  const text = await file.text();
  const delimiter = extension === "tsv" ? "\t" : text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitDelimitedLine(lines[0], delimiter).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return mapHeaders(record);
  });
}

/** Minimal CSV/TSV cell splitter that respects double-quoted fields containing the delimiter. */
function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function mapHeaders(record: Record<string, unknown>): RawRow {
  const row: RawRow = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_");
    const field = HEADER_ALIASES[normalizedKey];
    if (!field) continue;
    row[field] = value === undefined || value === null ? "" : String(value).trim();
  }
  return row;
}

function normalizeRow(row: RawRow): PeopleImportRow | null {
  const fullName = (row.fullName || "").trim();
  const email = (row.email || "").trim().toLowerCase();
  if (!fullName || !email) return null;

  const role: UserRole = (row.role || "").trim().toLowerCase() === "admin" ? "admin" : "player";
  const password = (row.password || "").trim();
  const rating = (row.rating || "").trim();
  const mobileNumber = (row.mobileNumber || "").trim();
  const createPlayerProfile =
    role === "player" && (row.createPlayerProfile === undefined || row.createPlayerProfile === "" || isTruthy(row.createPlayerProfile));

  return {
    fullName,
    email,
    password: password || undefined,
    role,
    rating: rating || undefined,
    mobileNumber: mobileNumber || undefined,
    createPlayerProfile
  };
}

function isTruthy(value: string) {
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

/** Detects the "SUPABASE_SERVICE_ROLE_KEY not configured" error returned by the invite API as HTTP 501. */
export function isServiceRoleMissingError(message: string | undefined | null) {
  return (message || "").toLowerCase().includes("service_role");
}
