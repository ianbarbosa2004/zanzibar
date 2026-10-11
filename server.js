import { basePath, port } from "./src/server/config.js";
import { deleteAuthSession, dbPool, findAuthSession, findAuthUser, initializeDataStore, listAuthUsers, readData, saveAuthSession, saveAuthUser, writeBillings, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction } from "./src/server/data-store.js";
import { createAuth } from "./src/server/auth.js";
import { createHttpServer } from "./src/server/http-server.js";
import { readStaticFile } from "./src/server/static-files.js";

const auth = createAuth({ findUser: findAuthUser, saveUser: saveAuthUser, listUsers: listAuthUsers, saveSession: saveAuthSession, findSession: findAuthSession, deleteSession: deleteAuthSession });
const server = createHttpServer({ basePath, auth, readData, writeBillings, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction, readStaticFile });

initializeDataStore().then(() => {
  server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}${dbPool ? " (MySQL)" : ""}`));
}).catch((error) => {
  console.error("Não foi possível inicializar o banco de dados.", error);
  process.exitCode = 1;
});
