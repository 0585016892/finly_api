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
const mysql = require("mysql2");
const dotenv = require("dotenv");
dotenv.config();

const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  ssl: {
    // Chấp nhận chứng chỉ tự ký (KHÔNG an toàn cho production thật sự)
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10, // số lượng connection tối đa
  queueLimit: 0, // không giới hạn số lượng request đang chờ
});

db.connect((err) => {
  if (err) {
    console.error("❌ Kết nối MySQL thất bại:", err.message);
    return;
  }
  console.log("✅ Đã kết nối MySQL");
});

module.exports = pool;
