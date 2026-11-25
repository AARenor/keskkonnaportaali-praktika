import { withDatabaseClient } from "../server/database.mjs";
import { corpusIndexPolicyStaticSql } from "../server/corpus_storage.mjs";

const requestedBatchSize = Math.trunc(Number(process.env.BODY_INDEX_BACKFILL_BATCH_SIZE || 500));
const batchSize = Math.max(1, Math.min(Number.isFinite(requestedBatchSize) ? requestedBatchSize : 500, 5_000));
const staticSql = corpusIndexPolicyStaticSql("document");

const summary = await withDatabaseClient(async (client) => {
  if (!client) throw new Error("DATABASE_URL is required for the body index policy backfill");
  await client.query(`
    ALTER TABLE practice_corpus_documents
      ADD COLUMN IF NOT EXISTS body_index_allowed BOOLEAN
  `);

  let cursor = 0;
  let updated = 0;
  let batches = 0;
  for (;;) {
    const batch = await client.query(`
      SELECT document.id
      FROM practice_corpus_documents AS document
      WHERE document.id > $1
      ORDER BY document.id
      LIMIT $2
    `, [cursor, batchSize]);
    const ids = batch.rows.map((row) => row.id);
    if (!ids.length) break;
    const result = await client.query(`
      UPDATE practice_corpus_documents AS document
      SET body_index_allowed = (${staticSql})
      WHERE document.id = ANY($1::BIGINT[])
    `, [ids]);
    batches += 1;
    updated += Number(result.rowCount || 0);
    cursor = ids[ids.length - 1];
  }

  const parity = await client.query(`
    SELECT
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE document.body_index_allowed IS NULL)::BIGINT AS missing,
      COUNT(*) FILTER (
        WHERE document.body_index_allowed IS DISTINCT FROM (${staticSql})
      )::BIGINT AS mismatched
    FROM practice_corpus_documents AS document
  `);
  const { total, missing, mismatched } = parity.rows[0];
  if (Number(mismatched) !== 0 || Number(missing) !== 0) {
    throw new Error(`body index parity check failed: ${mismatched} mismatched, ${missing} unbackfilled`);
  }
  return { total: Number(total), updated, batches, batchSize, mismatched: Number(mismatched), missing: Number(missing) };
});

if (!summary) throw new Error("DATABASE_URL is required for the body index policy backfill");
process.stdout.write(`${JSON.stringify(summary)}\n`);
