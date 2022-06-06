import { createConnection } from "mysql2";

const { DB_USER, PASSWORD, DATABASE } = process.env;

const dbConnection = createConnection({
  connectionLimit: 5,
  user: DB_USER,
  password: PASSWORD,
  database: DATABASE,
}).promise();

export { dbConnection };
