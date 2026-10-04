// PostgREST limits a response to the project's configured maximum row count.
// Use smaller pages and a stable ordering for complete reports and totals.
export async function fetchAllRows(makeQuery, pageSize = 500) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery().range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
