import { MongoMemoryReplSet } from "mongodb-memory-server";
import { fileURLToPath } from "node:url";
process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(
  new URL("../data/mongodb-binaries", import.meta.url),
);
export async function testMongo() {
  const repl = await MongoMemoryReplSet.create({
    binary: { version: "7.0.24" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  return { uri: repl.getUri(), stop: () => repl.stop() };
}
