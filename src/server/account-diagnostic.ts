type ReadOnlySqlite = { prepare(sql: string): { get(...values: string[]): unknown } };

export function queryAccountCredentialStatus(database: ReadOnlySqlite, email: string) {
  const result = database.prepare(`
    SELECT
      EXISTS(SELECT 1 FROM "User" WHERE lower("email") = lower(?)) AS userFound,
      EXISTS(
        SELECT 1 FROM "User" u
        JOIN "Account" a ON a."userId" = u.id
        WHERE lower(u."email") = lower(?)
          AND a."providerId" = 'credential'
          AND a."accountId" = u.id
          AND a.password IS NOT NULL
      ) AS credentialRecordFound
  `).get(email, email) as { userFound: number; credentialRecordFound: number };

  return {
    userFound: Boolean(result.userFound),
    credentialRecordFound: Boolean(result.credentialRecordFound),
  };
}
