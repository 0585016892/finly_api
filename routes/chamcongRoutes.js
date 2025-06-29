const express = require("express");
const router = express.Router();
const db = require("../db");
const ExcelJS = require("exceljs");

// Helper để dùng query dạng Promise
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// ✅ Lấy danh sách chấm công theo ngày
router.get("/date/:date", async (req, res) => {
  const { date } = req.params;
  const sql = `
    SELECT a.*, u.*
    FROM attendances a
    JOIN employees u ON a.user_id = u.id
    WHERE a.work_date = ?
  `;
  try {
    const rows = await query(sql, [date]);
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy chấm công theo ngày:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

// ✅ Export chấm công theo tháng
router.get("/export/:month", async (req, res) => {
  const { month } = req.params;
  const sql = `
    SELECT a.*, u.*
    FROM attendances a
    JOIN employees u ON a.user_id = u.id
    WHERE DATE_FORMAT(a.work_date, '%Y-%m') = ?
    ORDER BY a.work_date ASC
  `;
  try {
    const rows = await query(sql, [month]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Cham Cong");

    worksheet.columns = [
      { header: "Ngày", key: "work_date", width: 15 },
      { header: "Mã NV", key: "user_id", width: 10 },
      { header: "Tên nhân viên", key: "full_name", width: 25 },
      { header: "Check In", key: "check_in_time", width: 20 },
      { header: "Check Out", key: "check_out_time", width: 20 },
      { header: "Trạng thái", key: "status", width: 15 },
      { header: "Ghi chú", key: "note", width: 30 },
    ];

    rows.forEach((row) => {
      worksheet.addRow({
        work_date: row.work_date,
        user_id: row.user_id,
        full_name: row.full_name,
        check_in_time: row.check_in_time,
        check_out_time: row.check_out_time,
        status: row.status,
        note: row.note || "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=chamcong-${month}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Lỗi export chấm công:", err);
    res.status(500).json({ message: "Lỗi khi tạo file Excel" });
  }
});

// ✅ Lọc phân trang theo tên nhân viên
router.get("/filter", async (req, res) => {
  const name = req.query.name || "";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const searchName = `%${name}%`;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM attendances a
    JOIN employees u ON a.user_id = u.id
    WHERE u.full_name LIKE ?
  `;

  const dataSql = `
    SELECT a.*, u.full_name
    FROM attendances a
    JOIN employees u ON a.user_id = u.id
    WHERE u.full_name LIKE ?
    ORDER BY a.work_date DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const countResult = await query(countSql, [searchName]);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const dataRows = await query(dataSql, [searchName, limit, offset]);

    res.json({
      total,
      totalPages,
      currentPage: page,
      data: dataRows,
    });
  } catch (err) {
    console.error("❌ Lỗi lọc phân trang:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

module.exports = router;
