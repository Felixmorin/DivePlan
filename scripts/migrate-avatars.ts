import { Pool } from "pg";
import { uploadAvatarDataUrl } from "../src/lib/avatar-storage-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL n'est pas configurée.");
const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: databaseUrl });

try {
  const { rows } = await pool.query<{ id: string; avatar: string }>(
    `SELECT id, avatar FROM "User" WHERE avatar LIKE 'data:image/%' ORDER BY id`
  );
  console.log(`${rows.length} photo(s) base64 à migrer${apply ? "." : " (simulation; aucune modification)."}`);
  if (apply) {
    for (const user of rows) {
      const reference = await uploadAvatarDataUrl(user.id, user.avatar);
      const result = await pool.query(
        `UPDATE "User" SET avatar = $1 WHERE id = $2 AND avatar = $3`,
        [reference, user.id, user.avatar]
      );
      console.log(`${user.id}: ${result.rowCount === 1 ? "migrée" : "ignorée (valeur modifiée entre-temps)"}`);
    }
  }
} finally {
  await pool.end();
}
