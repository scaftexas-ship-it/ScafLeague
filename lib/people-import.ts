import * as XLSX from "xlsx";
import { combineName } from "./format.ts";
import type { UserRole } from "./types";

export type PeopleImportRow = {
  rowNumber: number;
  fullName: string;
  email: string;
  password?: string;
  role: UserRole;
  rating?: string;
  duprRating?: string;
  mobileNumber?: string;
  createPlayerProfile: boolean;
};

export type SkippedImportRow = {
  rowNumber: number;
  reason: string;
};

const EXPECTED_COLUMNS = "first_name, last_name, email, mobile_number, role, password, rating, dupr, create_player_profile";

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  first_name: "firstName",
  firstname: "firstName",
  first: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  last: "lastName",
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
  dupr: "duprRating",
  dupr_rating: "duprRating",
  duprrating: "duprRating",
  create_player_profile: "createPlayerProfile",
  createplayerprofile: "createPlayerProfile"
};

type RawRow = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  role?: string;
  password?: string;
  rating?: string;
  duprRating?: string;
  createPlayerProfile?: string;
};

export class PeopleImportError extends Error {}

export async function parsePeopleImportFile(file: File): Promise<{ rows: PeopleImportRow[]; skipped: SkippedImportRow[] }> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const rawRows = ["xls", "xlsx"].includes(extension) ? await parseSpreadsheet(file) : await parseDelimited(file, extension);

  const rows: PeopleImportRow[] = [];
  const skipped: SkippedImportRow[] = [];

  rawRows.forEach((raw, index) => {
    // Row 1 is the header, so the first data row is row 2 -- matches what a
    // person sees looking at the file in Excel/Sheets.
    const rowNumber = index + 2;
    const result = normalizeRow(raw, rowNumber);
    if (result.row) rows.push(result.row);
    else skipped.push({ rowNumber, reason: result.reason });
  });

  if (rows.length === 0 && skipped.length === 0) {
    throw new PeopleImportError(`No people found. Use columns: ${EXPECTED_COLUMNS}.`);
  }

  return { rows, skipped };
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

function normalizeRow(row: RawRow, rowNumber: number): { row: PeopleImportRow; reason?: undefined } | { row?: undefined; reason: string } {
  const firstName = (row.firstName || "").trim();
  const lastName = (row.lastName || "").trim();
  // first_name/last_name take priority when present; full_name is a fallback
  // for files that only have that single column.
  const fullName = firstName || lastName ? combineName(firstName, lastName) : (row.fullName || "").trim();
  const email = (row.email || "").trim().toLowerCase();
  if (!fullName && !email) return { reason: "Missing name and email." };
  if (!fullName) return { reason: "Missing name." };
  if (!email) return { reason: "Missing email." };

  const role: UserRole = (row.role || "").trim().toLowerCase() === "admin" ? "admin" : "player";
  const password = (row.password || "").trim();
  const rating = (row.rating || "").trim();
  const duprRating = (row.duprRating || "").trim();
  const mobileNumber = (row.mobileNumber || "").trim();
  const createPlayerProfile =
    role === "player" && (row.createPlayerProfile === undefined || row.createPlayerProfile === "" || isTruthy(row.createPlayerProfile));

  return {
    row: {
      rowNumber,
      fullName,
      email,
      password: password || undefined,
      role,
      rating: rating || undefined,
      duprRating: duprRating || undefined,
      mobileNumber: mobileNumber || undefined,
      createPlayerProfile
    }
  };
}

function isTruthy(value: string) {
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

/** Detects the "SUPABASE_SERVICE_ROLE_KEY not configured" error returned by the invite API as HTTP 501. */
export function isServiceRoleMissingError(message: string | undefined | null) {
  return (message || "").toLowerCase().includes("service_role");
}
