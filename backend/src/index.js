import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
try {
  const database = await openDatabase(
    process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/?replicaSet=atithi-rs",
    {
      dbName: process.env.MONGODB_DB || "atithi",
      seed: process.env.SERVE_DEMO_DATA !== "false",
    },
  );
  const port = Number(process.env.PORT || 4000),
    host = process.env.HOST || "127.0.0.1";
  const app = createApp(database, {
    staticDir: resolve(root, "../frontend/build"),
    secureCookies: process.env.COOKIE_SECURE === "true",
  });
  const server = app.listen(port, host, () =>
    console.log(
      `Atithi HMS: http://${host}:${port}\nDatabase engine: MongoDB\nDatabase name: ${process.env.MONGODB_DB || "atithi"}`,
    ),
  );
  server.on("error", async (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use.`
        : error.message,
    );
    await database.close();
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(async () => {
        await database.close();
        process.exit(0);
      }),
    );
} catch (error) {
  console.error(
    "MongoDB startup failed. Start npm run db:local or configure MONGODB_URI with a replica-set/Atlas connection.",
  );
  console.error(
    error.name === "MongoServerSelectionError"
      ? "Could not reach the configured MongoDB server."
      : error.message,
  );
  process.exitCode = 1;
}
