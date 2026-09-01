import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";
import { getContentLimits, truncateContentText } from "../contentLimits.js";

export const SUPPORTED_CSV_MIME_TYPES = Object.freeze([
  "text/csv",
  "application/csv",
]);

export function isSupportedCsvMimeType(mimeType) {
  return SUPPORTED_CSV_MIME_TYPES.includes((mimeType || "").toLowerCase());
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (inQuotes) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "CSV contains an unterminated quoted field");
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function processCsvContent(content) {
  const mimeType = (content?.original?.mimeType || "").toLowerCase();
  if (!mimeType) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "CSV MIME type is required");
  }
  if (!isSupportedCsvMimeType(mimeType)) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
      `Unsupported CSV MIME type: ${mimeType}`,
    );
  }

  const binary = content.representations?.find(
    representation => representation.type === REPRESENTATION_TYPES.BINARY && representation.data,
  );
  if (!binary) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      "CSV content requires a binary representation",
    );
  }

  const text = Buffer.from(binary.data).toString("utf8");
  const { maxTextLength } = getContentLimits();
  if (text.length > maxTextLength) {
    throw new ContentError(
      CONTENT_ERROR_CODES.CONTENT_TOO_LARGE,
      `CSV text exceeds the ${maxTextLength} character limit`,
      { maxTextLength, actualLength: text.length },
    );
  }

  const rows = parseCsvRows(text);
  const headers = rows.length > 0 ? rows[0] : [];
  const dataRows = rows.slice(1);
  const { maxCsvRows = 10_000 } = getContentLimits();

  if (headers.length === 0) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "CSV header row is required");
  }
  if (headers.some(header => !header.trim())) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "CSV contains an empty header");
  }
  if (dataRows.length > maxCsvRows) {
    throw new ContentError(CONTENT_ERROR_CODES.CONTENT_TOO_LARGE, `CSV exceeds the ${maxCsvRows} row limit`, { maxCsvRows });
  }
  if (dataRows.some(row => row.length !== headers.length)) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "CSV row has a different number of columns");
  }

  const structuredRows = dataRows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const normalized = truncateContentText(text, maxTextLength);

  return {
    ...content,
    representations: [
      ...(content.representations || []),
      {
        type: REPRESENTATION_TYPES.TEXT,
        mimeType: "text/csv",
        text: normalized.text,
        truncated: normalized.truncated,
        originalLength: normalized.originalLength,
      },
      {
        type: REPRESENTATION_TYPES.STRUCTURED,
        mimeType: "application/json",
        schema: {
          columns: headers.map(name => ({ name })),
          rowCount: dataRows.length,
        },
        rows: structuredRows,
      },
    ],
    metadata: {
      ...(content.metadata || {}),
      processedAs: "csv",
      rowCount: dataRows.length,
      columnCount: headers.length,
    },
  };
}
