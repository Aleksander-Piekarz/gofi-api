const mysql = require("mysql2");

// Budujemy konfigurację
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};


if (process.env.DB_PORT) {
  dbConfig.port = Number(process.env.DB_PORT);
  console.log(`Łączę z bazą danych używając portu: ${dbConfig.port}`);
} else {
  console.log("Używam domyślnego portu bazy danych (z hosta lub 3306).");
}

// Tworzymy I eksportujemy pulę połączeń
const pool = mysql.createPool(dbConfig);

console.log("Pula połączeń MySQL została pomyślnie utworzona.");

module.exports = { pool };