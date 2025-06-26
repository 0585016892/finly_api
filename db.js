const mysql = require("mysql2");
const dotenv = require("dotenv");
dotenv.config();

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  connectTimeout: 10000, // thêm timeout 10 giây
  ssl: {
    rejectUnauthorized: true, // một số dịch vụ yêu cầu SSL
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
