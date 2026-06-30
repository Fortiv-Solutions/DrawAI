// Detect base sheet key + revision number from a file name.
// Examples:
//   "A101.dwg"             -> { baseKey: "A101", revNumber: 0, sheetNo: "A101" }
//   "A101 Rev-01.dwg"      -> { baseKey: "A101", revNumber: 1, sheetNo: "A101" }
//   "A101_R2.dwg"          -> { baseKey: "A101", revNumber: 2, sheetNo: "A101" }
//   "Floor Plan (R3).pdf"  -> { baseKey: "FLOORPLAN", revNumber: 3, sheetNo: "Floor Plan" }

export interface DetectedRevision {
  baseKey: string;
  /** Original sheet stem, trimmed of revision token. */
  sheetNo: string;
  revNumber: number;
  /** Display label, e.g. "R0", "R3". */
  rev: string;
}

const REV_PATTERNS: RegExp[] = [
  /[\s_\-]*\(\s*(?:rev|r|v|ver|version)[\s\-_]?(\d+)\s*\)\s*$/i,
  /[\s_\-]+(?:rev|r|v|ver|version)[\s\-_]?(\d+)\s*$/i,
];

export function detectRevision(rawFileName: string): DetectedRevision {
  const stem = rawFileName.replace(/\.[^.]+$/, "").trim();
  let sheetNo = stem;
  let revNumber = 0;

  for (const re of REV_PATTERNS) {
    const m = stem.match(re);
    if (m) {
      revNumber = parseInt(m[1], 10);
      sheetNo = stem.replace(re, "").trim();
      break;
    }
  }

  const baseKey = sheetNo.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
  return {
    baseKey: baseKey || sheetNo.toUpperCase(),
    sheetNo: sheetNo || stem,
    revNumber,
    rev: `R${revNumber}`,
  };
}

export function nextRev(existing: number[]): { revNumber: number; rev: string } {
  const next = existing.length === 0 ? 0 : Math.max(...existing) + 1;
  return { revNumber: next, rev: `R${next}` };
}
