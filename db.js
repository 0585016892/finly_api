// const mysql = require("mysql2");
// const dotenv = require("dotenv");
// dotenv.config();

// const pool = mysql.createPool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   waitForConnections: true,
//   connectionLimit: 10, // số lượng connection tối đa
//   queueLimit: 0, // không giới hạn số lượng request đang chờ
// });

// console.log("✅ MySQL pool đã sẵn sàng");

// module.exports = pool;
const mysql = require("mysql2/promise"); // Ưu tiên dùng mysql2/promise
const dotenv = require("dotenv");
dotenv.config();

// Sử dụng connection pool
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log("✅ MySQL pool đã sẵn sàng");

module.exports = pool; // ✅ Export đúng
