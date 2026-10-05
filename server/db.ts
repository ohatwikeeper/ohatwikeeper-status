import mysql from 'mysql2/promise'

// 履歴は永続保存する: このアプリは service_checks を INSERT/SELECT するだけで、DELETE・DDL は一切行わない
export const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  connectionLimit: 5, charset: 'utf8mb4',
})

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params)
  return rows as T[]
}
