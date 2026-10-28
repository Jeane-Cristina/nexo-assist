import { loadConfig } from "../config";
import { createDb, migrate } from "./client";
import { seed, wipe } from "./seed";

const config = loadConfig();
const db = createDb(config.TICKETS_DB_URL, config.TICKETS_DB_AUTH_TOKEN);

await wipe(db);
await migrate(db);
await seed(db, new Date());
console.log("Banco de chamados recriado com os dados de exemplo.");
db.close();
