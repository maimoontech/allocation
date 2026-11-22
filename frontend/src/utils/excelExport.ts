/**
 * Downloading a table as an Excel file.
 *
 * WHAT THIS PRODUCES, AND WHY IT IS NOT A REAL .xlsx
 *   An HTML document served as `application/vnd.ms-excel` with an `.xls` extension. Excel,
 *   LibreOffice and Google Sheets all open it as a worksheet with the headings and borders
 *   intact. A genuine .xlsx is a ZIP of XML parts, which needs a library on one side or a
 *   hand-written ZIP writer on the other, and this application already uses this approach for
 *   the Reports and Schedules downloads — so a Members export that worked differently would
 *   behave differently for the same operator pressing the same-looking button.
 *
 *   The cost is honest and small: Excel shows a "the file format and extension don't match"
 *   prompt once, on some versions and some settings, and opens it when you say yes.
 *
 * WHY IT IS A SHARED MODULE
 *   ReportsPage and SchedulesPage each hold their own copy of these four helpers, and
 *   ImportExportPage a third copy of the download one. This is the fourth caller, so the
 *   copying stops here. The two existing pages are deliberately NOT rewritten to use it:
 *   they are large, well covered, and work, and changing them is a separate piece of work
 *   from adding an export to Members.
 *
 * NUMBERS THAT ARE NOT NUMBERS
 *   An ITS number is 6 to 20 DIGITS and is an identifier, not a quantity. Left to itself
 *   Excel reads a long run of digits as a number, and past 15 significant figures it rounds
 *   it — so a 20-digit ITS number would arrive in the spreadsheet subtly wrong, and an
 *   operator pasting it back into a search would find nobody. A column marked `text: true`
 *   carries the Excel-specific `mso-number-format` that forces the cell to Text, which is why
 *   that option exists rather than being a styling nicety.
 */

export type ExcelColumn = {
  header: string;
  /** Forces Excel to treat the column as text. Use for identifiers and phone numbers. */
  text?: boolean;
};

export type ExcelTable = {
  columns: ExcelColumn[];
  /** One array per row, already formatted for reading. Same length as `columns`. */
  rows: string[][];
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function timestampForFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

export function normalizeFilenamePart(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The `<table>` on its own, which is also the unit the tests assert on. */
export function buildExcelTableHtml(table: ExcelTable): string {
  // `mso-number-format:'\@'` is Excel's "this cell is Text". The backslash-at is the format
  // code for text and is not a typo.
  const textStyle = ` style="mso-number-format:'\\@';"`;

  const head = table.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = table.rows
    .map((row) => {
      const cells = row
        .map((cell, index) => {
          const style = table.columns[index]?.text ? textStyle : "";
          return `<td${style}>${escapeHtml(cell)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildExcelDocument(args: {
  title: string;
  metaLines: string[];
  table: ExcelTable;
}): string {
  const safeTitle = escapeHtml(args.title);
  const safeMeta = args.metaLines
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #111; }
      h2 { margin: 0 0 6px 0; font-size: 18px; }
      .meta { font-size: 12px; margin-bottom: 12px; color: #333; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cfcfcf; padding: 6px 8px; font-size: 12px; vertical-align: top; }
      th { background: #f3f3f3; text-align: left; }
    </style>
  </head>
  <body>
    <h2>${safeTitle}</h2>
    <div class="meta">${safeMeta}</div>
    ${buildExcelTableHtml(args.table)}
  </body>
</html>`;
}

export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Builds the document and hands it to the browser as a download. */
export function downloadExcelTable(args: {
  title: string;
  metaLines: string[];
  filenameBase: string;
  table: ExcelTable;
}): void {
  const html = buildExcelDocument(args);
  const filename = `${normalizeFilenamePart(args.filenameBase || args.title)}_${timestampForFilename()}.xls`;
  // The BOM is for the benefit of Excel on Windows, which otherwise reads the bytes in the
  // system codepage and mangles any name outside ASCII despite the charset meta tag.
  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadBlobFile(filename, blob);
}
