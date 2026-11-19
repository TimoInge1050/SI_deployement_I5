const mariadb = require("mariadb");

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const port = Number(DB_PORT);
const missingConfiguration = Object.entries({
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingConfiguration.length > 0) {
  throw new Error(`Configuration MariaDB manquante : ${missingConfiguration.join(", ")}`);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT doit être un entier entre 1 et 65535");
}

module.exports = mariadb.createPool({
  host: DB_HOST,
  port,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 5,
});