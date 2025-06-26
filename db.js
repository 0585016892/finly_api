const mysql = require("mysql2");
const dotenv = require("dotenv");
dotenv.config();

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  ssl: {
    // Chấp nhận chứng chỉ tự ký (KHÔNG an toàn cho production thật sự)
    rejectUnauthorized: false,
  },
});

db.connect((err) => {
  if (err) {
    console.error("❌ Kết nối MySQL thất bại:", err.message);
    return;
  }
  console.log("✅ Đã kết nối MySQL");
});

module.exports = db;
