export function normalizeReg(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function validateRoster(rows, existingStudents = []) {
  const known = new Set(existingStudents.filter(student => !student.archived_at)
    .map(student => normalizeReg(student.reg_number)));
  const valid = [];
  const invalid = [];
  const duplicate = [];
  rows.forEach((row, index) => {
    const name = String(row.name ?? '').trim().replace(/\s+/g, ' ');
    const reg_number = normalizeReg(row.reg_number);
    if (!name || !reg_number) invalid.push(index + 1);
    else if (known.has(reg_number)) duplicate.push(index + 1);
    else {
      known.add(reg_number);
      valid.push({ name, reg_number });
    }
  });
  return { valid, invalid, duplicate };
}

const hasDigit = value => /\d/.test(value);
// A first row with a 'name' column and no digits anywhere is a header.
const isHeaderRow = cells => cells.some(cell => /name/i.test(cell)) && !cells.some(hasDigit);

// Orders a pair of cells as { name, reg_number }. Registration numbers carry
// digits and names usually don't, so a reversed "Reg, Name" row is swapped.
export function orderPair(first, second) {
  const a = String(first ?? '').trim();
  const b = String(second ?? '').trim();
  if (hasDigit(a) && !hasDigit(b)) return { name: b, reg_number: a };
  return { name: a, reg_number: b };
}

// Parses a pasted roster. Accepts rows copied from Excel/Sheets (tabs),
// "Name, Reg" / "Name; Reg" / "Name | Reg", either column order, numbered
// lists ("1. Ali Khan, 21-CS-01") and "Ali Khan 21-CS-01" with no separator.
export function parseRosterText(text) {
  const rows = [];
  String(text ?? '').split(/\r?\n/).forEach(rawLine => {
    let line = rawLine.trim();
    if (!line) return;
    line = line.replace(/^\(?\d{1,3}\s*[.)\]-]\s+/, '');
    const unnumbered = line.replace(/^\d{1,3}\s+(?=\p{L})/u, '');
    if (unnumbered !== line && hasDigit(unnumbered)) line = unnumbered;
    let cells;
    if (line.includes('\t')) cells = line.split('\t');
    else if (/[,;|]/.test(line)) cells = line.split(/\s*[,;|]\s*/);
    else {
      const tokens = line.split(/\s+/);
      if (tokens.length > 1 && hasDigit(tokens.at(-1))) cells = [tokens.slice(0, -1).join(' '), tokens.at(-1)];
      else if (tokens.length > 1 && hasDigit(tokens[0])) cells = [tokens[0], tokens.slice(1).join(' ')];
      else cells = [line];
    }
    cells = cells.map(cell => cell.trim()).filter(Boolean);
    // Spreadsheet rows sometimes lead with a serial-number column.
    if (cells.length > 2 && /^\d{1,3}$/.test(cells[0])) cells = cells.slice(1);
    if (rows.length === 0 && cells.length >= 2 && isHeaderRow(cells)) return;
    rows.push(cells.length >= 2 ? orderPair(cells[0], cells[1]) : { name: cells[0] ?? '', reg_number: '' });
  });
  return rows;
}

// Converts spreadsheet rows (arrays of cells) into roster rows, skipping a
// header row and an optional leading serial-number column.
export function parseRosterSheet(sheetRows) {
  const rows = [];
  sheetRows.forEach(row => {
    let cells = (row || []).map(cell => String(cell ?? '').trim());
    if (!cells.some(Boolean)) return;
    if (rows.length === 0 && isHeaderRow(cells.filter(Boolean))) return;
    if (cells.length > 2 && /^\d{1,3}$/.test(cells[0]) && cells[1] && cells[2]) cells = cells.slice(1);
    cells = cells.filter(Boolean);
    rows.push(cells.length >= 2 ? orderPair(cells[0], cells[1]) : { name: cells[0] ?? '', reg_number: '' });
  });
  return rows;
}
