import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase, transaction } from "../src/db.js";
// This one-time importer is the only SQLite dependency. The running API never uses SQLite.
const backendRoot = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(resolve(backendRoot, ".env")))
  process.loadEnvFile(resolve(backendRoot, ".env"));
const file = resolve(
  process.argv[2] || resolve(backendRoot, "data/hms.sqlite"),
);
if (!existsSync(file)) throw new Error("Legacy database not found: " + file);
const sqlite = new DatabaseSync(file, { readOnly: true });
const mongo = await openDatabase(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/?replicaSet=atithi-rs",
  { dbName: process.env.MONGODB_DB || "atithi", seed: false },
);
const tables = [
  "settings",
  "users",
  "rooms",
  "reservations",
  "charges",
  "payments",
  "journal",
  "inventory",
  "stock_movements",
  "employees",
  "payroll",
  "messages",
  "audit",
];
try {
  await transaction(mongo, async () => {
    for (const table of tables.filter((t) => t !== "settings"))
      if (await mongo.count(table))
        throw new Error(
          "Target MongoDB is not empty. Import aborted without changes.",
        );
    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        if (table === "settings") {
          const value = JSON.parse(row.value);
          await mongo.native
            .collection(table)
            .updateOne({ key: row.key }, { $set: { value } }, mongo.options());
          continue;
        }
        if (table === "inventory") row.name_key = row.name.toLowerCase();
        // Keep audit timestamp strings unchanged so the original SHA-256 chain verifies.
        await mongo.native
          .collection(table)
          .insertOne({ ...row }, mongo.options());
      }
      if (table !== "settings")
        await mongo.native
          .collection("counters")
          .updateOne(
            { _id: table },
            { $set: { value: Math.max(0, ...rows.map((r) => r.id)) } },
            { ...mongo.options(), upsert: true },
          );
    }
    console.log(
      "Imported legacy records. IDs, password hashes, journal and audit chain preserved. Sessions were intentionally not imported; sign in again.",
    );
  });
} finally {
  sqlite.close();
  await mongo.close();
}
