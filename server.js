import { basePath, port } from "./src/server/config.js";
import { dbPool, initializeDataStore, readData, writeData } from "./src/server/data-store.js";
import { createHttpServer } from "./src/server/http-server.js";
import { readStaticFile } from "./src/server/static-files.js";

const server = createHttpServer({ basePath, readData, writeData, readStaticFile });

initializeDataStore().then(() => {
  server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}${dbPool ? " (MySQL)" : ""}`));
}).catch((error) => {
  console.error("Não foi possível inicializar o banco de dados.", error);
  process.exitCode = 1;
});
