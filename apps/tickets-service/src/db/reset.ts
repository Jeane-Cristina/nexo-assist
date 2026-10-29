import { loadConfig } from "../config.js";
import { createDb, migrate } from "./client.js";
import { seed, wipe } from "./seed.js";

const config = loadConfig();
const db = createDb(config.TICKETS_DB_URL, config.TICKETS_DB_AUTH_TOKEN);

await wipe(db);
await migrate(db);
await seed(db, new Date());
console.log("Banco de chamados recriado com os dados de exemplo.");
db.close();
