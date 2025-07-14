const mysql = require("mysql2");
const dotenv = require("dotenv");
dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  port: process.env.MYSQLPORT,
  database: process.env.MYSQLDATABASE,
  ssl: false, 
  // ssl: {
  //       rejectUnauthorized: false,
  //     },
  waitForConnections: true,
  connectionLimit: 10, // số lượng connection tối đa
  queueLimit: 0, // không giới hạn số lượng request đang chờ
});

console.log("✅ MySQL pool đã sẵn sàng");

module.exports = pool;
// 📁 db.js
// const mysql = require("mysql2");
// const dotenv = require("dotenv");
// dotenv.config();

// const pool = mysql.createPool({
//   host: process.env.MYSQLHOST || "localhost",
//   user: process.env.MYSQLUSER || "root",
//   password: process.env.MYSQLPASSWORD || "",
//   database: process.env.MYSQLDATABASE || "node_api",
//   port: process.env.MYSQLPORT || 3306,
//   ssl: false, // ❌ Tắt SSL vì local không cần
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });

// console.log("✅ MySQL pool đã sẵn sàng (Local)");

// module.exports = pool;
