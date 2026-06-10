/**
 * Prisma skip/take arguments for a paginated list query.
 * A limit of 0 (or any non-positive value) means "no pagination" — return all rows.
 */
export function paginationArgs(
  page: number,
  limit: number
): { skip?: number; take?: number } {
  if (limit <= 0) return {};
  return { skip: (page - 1) * limit, take: limit };
}

/**
 * Pagination metadata for list API responses.
 * With limit 0 (fetch all) the response is a single page covering every row.
 */
export function paginationMeta(page: number, limit: number, total: number) {
  if (limit <= 0) {
    return { page: 1, limit: total, total, totalPages: 1 };
  }
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
