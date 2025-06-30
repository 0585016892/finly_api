const mysql = require("mysql2");
const dotenv = require("dotenv");
dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  port: process.env.MYSQLPORT,
  database: process.env.MYSQLDATABASE,
  ssl: {
        rejectUnauthorized: false,
      },
  waitForConnections: true,
  connectionLimit: 10, // số lượng connection tối đa
  queueLimit: 0, // không giới hạn số lượng request đang chờ
});

console.log("✅ MySQL pool đã sẵn sàng");

module.exports = pool;
// const mysql = require("mysql2");
// const dotenv = require("dotenv");
// dotenv.config();

// const db = mysql.createConnection({
//   host: process.env.MYSQLHOST,
//   port: process.env.MYSQLPORT,
//   user: process.env.MYSQLUSER,
//   password: process.env.MYSQLPASSWORD,
//   database: process.env.MYSQLDATABASE,
//   ssl: {
//     // Chấp nhận chứng chỉ tự ký (KHÔNG an toàn cho production thật sự)
//     rejectUnauthorized: false,
//   },
//   waitForConnections: true,
//   connectionLimit: 10, // số lượng connection tối đa
//   queueLimit: 0, // không giới hạn số lượng request đang chờ
// });

// db.connect((err) => {
//   if (err) {
//     console.error("❌ Kết nối MySQL thất bại:", err.message);
//     return;
//   }
//   console.log("✅ Đã kết nối MySQL");
// });
