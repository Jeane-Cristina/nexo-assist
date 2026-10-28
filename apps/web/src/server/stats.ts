import type { Client } from "@libsql/client";

export type ServiceDeskStats = {
  avgFirstResponseSeconds: number | null;
  resolvedWithoutQueuePct: number | null;
  analystsOnline: number;
};

export const ONLINE_WINDOW_MS = 2 * 60_000;

export async function getStats(db: Client, now: Date = new Date()): Promise<ServiceDeskStats> {
  const [response, queue, online] = await db.batch(
    [
      `SELECT AVG((julianday(next_at) - julianday(created_at)) * 86400.0) AS avg_s
         FROM (SELECT role, created_at,
                      LEAD(role) OVER w AS next_role,
                      LEAD(created_at) OVER w AS next_at
                 FROM messages
               WINDOW w AS (PARTITION BY conversation_id ORDER BY seq))
        WHERE role = 'employee' AND next_role = 'agent'`,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id
                                     AND m.role = 'system' AND m.content LIKE 'Transferida%') THEN 0 ELSE 1 END) AS no_queue
         FROM conversations c
        WHERE c.employee_message_count > 0`,
      { sql: "SELECT COUNT(*) AS n FROM analyst_presence WHERE last_seen >= ?", args: [new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString()] },
    ],
    "read",
  );
  const avg = response?.rows[0]?.avg_s;
  const total = Number(queue?.rows[0]?.total ?? 0);
  const noQueue = Number(queue?.rows[0]?.no_queue ?? 0);
  return {
    avgFirstResponseSeconds: avg === null || avg === undefined ? null : Number(avg),
    resolvedWithoutQueuePct: total > 0 ? Math.round((noQueue / total) * 100) : null,
    analystsOnline: Number(online?.rows[0]?.n ?? 0),
  };
}

export async function touchPresence(db: Client, email: string, now: Date = new Date()): Promise<void> {
  await db.execute({
    sql: "INSERT INTO analyst_presence (email, last_seen) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET last_seen = excluded.last_seen",
    args: [email, now.toISOString()],
  });
}
