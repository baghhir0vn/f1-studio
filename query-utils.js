/**
 * Shared Supabase pagination helper.
 * Keeps the service layer consistent without changing query semantics.
 */
export async function fetchAllRows(queryFactory, { pageSize = 1000, maxRows = 25000 } = {}) {
    const rows = [];
    for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await queryFactory().range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
    }
    return rows.slice(0, maxRows);
}
