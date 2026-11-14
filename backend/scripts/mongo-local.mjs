import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const dbPath = resolve("data/mongodb");
mkdirSync(dbPath, { recursive: true });
process.env.MONGOMS_DOWNLOAD_DIR = resolve("data/mongodb-binaries");
console.log(
  "Starting a real local MongoDB replica set with persistent WiredTiger data…",
);
console.log("First start downloads the MongoDB server binary if necessary.");
const repl = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24" },
  instanceOpts: [{ port: 27017, dbPath }],
  replSet: {
    name: "atithi-rs",
    count: 1,
    storageEngine: "wiredTiger",
    ip: "127.0.0.1",
  },
});
console.log("MongoDB ready at mongodb://127.0.0.1:27017/?replicaSet=atithi-rs");
console.log(
  "Local development only: no authentication, bound to loopback. Data: " +
    dbPath,
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, async () => {
    await repl.stop({ doCleanup: false, force: false });
    process.exit(0);
  });
