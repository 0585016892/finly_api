const express = require("express");
const router = express.Router();
const db = require("../db");

// Hàm kiểm tra định dạng ngày YYYY-MM-DD
function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// 1. Báo cáo doanh thu
router.get("/revenue", async (req, res) => {
  const { from_date, to_date, period = "month" } = req.query;

  if (
    (from_date && !isValidDate(from_date)) ||
    (to_date && !isValidDate(to_date))
  ) {
    return res
      .status(400)
      .json({ error: "from_date hoặc to_date sai định dạng YYYY-MM-DD" });
  }

  let sql, params, dateFormat;

  switch (period) {
    case "day":
      dateFormat = "%Y-%m-%d";
      break;
    case "quarter":
      sql = `
        SELECT
          CONCAT(YEAR(created_at), '-Q', QUARTER(created_at)) AS period,
          SUM(final_total) AS revenue
        FROM orders
        WHERE (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?)
        GROUP BY YEAR(created_at), QUARTER(created_at)
        ORDER BY YEAR(created_at), QUARTER(created_at)
      `;
      params = [
        from_date || null,
        from_date || null,
        to_date || null,
        to_date || null,
      ];
      break;
    case "year":
      dateFormat = "%Y";
      break;
    default:
      dateFormat = "%Y-%m";
  }

  try {
    let results;
    if (period === "quarter") {
      [results] = await db.query(sql, params);
    } else {
      sql = `
        SELECT
          DATE_FORMAT(created_at, ?) AS period,
          SUM(final_total) AS revenue
        FROM orders
        WHERE (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?)
        GROUP BY period
        ORDER BY period
      `;
      params = [
        dateFormat,
        from_date || null,
        from_date || null,
        to_date || null,
        to_date || null,
      ];
      [results] = await db.query(sql, params);
    }

    res.json({ data: results });
  } catch (err) {
    console.error("Error in /revenue:", err);
    res.status(500).json({ error: "Lỗi server khi lấy báo cáo doanh thu" });
  }
});

// 2. Báo cáo số lượng đơn hàng theo tháng
router.get("/orders", async (req, res) => {
  const { from_date, to_date } = req.query;

  if (
    (from_date && !isValidDate(from_date)) ||
    (to_date && !isValidDate(to_date))
  ) {
    return res
      .status(400)
      .json({ error: "from_date hoặc to_date sai định dạng YYYY-MM-DD" });
  }

  let sql = `
    SELECT DATE_FORMAT(created_at, '%Y-%m') AS period, COUNT(id) AS orders_count
    FROM orders
  `;
  const params = [];

  if (from_date && to_date) {
    sql += ` WHERE created_at BETWEEN ? AND ?`;
    params.push(from_date, to_date);
  }

  sql += ` GROUP BY period ORDER BY period`;

  try {
    const [results] = await db.query(sql, params);
    res.json({ data: results });
  } catch (err) {
    console.error("Error in /orders:", err);
    res.status(500).json({ error: "Lỗi server khi lấy báo cáo đơn hàng" });
  }
});

// 3. Top sản phẩm bán chạy
router.get("/top-products", async (req, res) => {
  const { limit = 5, from_date, to_date } = req.query;

  if (!from_date || !to_date) {
    return res.status(400).json({ error: "Thiếu from_date hoặc to_date" });
  }
  if (!isValidDate(from_date) || !isValidDate(to_date)) {
    return res
      .status(400)
      .json({ error: "from_date hoặc to_date sai định dạng YYYY-MM-DD" });
  }

  let limitNum = parseInt(limit);
  if (isNaN(limitNum) || limitNum < 1) limitNum = 5;
  if (limitNum > 20) limitNum = 20;

  const sql = `
    SELECT p.name, SUM(od.quantity) AS total_sold
    FROM order_items od
    JOIN sanpham p ON od.product_id = p.id
    JOIN orders o ON od.order_id = o.id
    WHERE o.created_at BETWEEN ? AND ?
    GROUP BY p.id
    ORDER BY total_sold DESC
    LIMIT ?
  `;

  try {
    const [results] = await db.query(sql, [from_date, to_date, limitNum]);
    res.json({ data: results });
  } catch (err) {
    console.error("Error in /top-products:", err);
    res.status(500).json({ error: "Lỗi server khi lấy top sản phẩm" });
  }
});

// 4. Thống kê khách hàng theo tổng chi tiêu
router.get("/customers", async (req, res) => {
  const { from_date, to_date } = req.query;

  if (!from_date || !to_date) {
    return res.status(400).json({ error: "Thiếu from_date hoặc to_date" });
  }
  if (!isValidDate(from_date) || !isValidDate(to_date)) {
    return res
      .status(400)
      .json({ error: "from_date hoặc to_date sai định dạng YYYY-MM-DD" });
  }

  const sql = `
    SELECT
      CASE 
        WHEN total_spent < 500000 THEN 'Khách mới'
        WHEN total_spent BETWEEN 500000 AND 1000000 THEN 'Khách trung thành'
        ELSE 'Khách VIP'
      END AS customer_group,
      COUNT(*) AS count
    FROM (
      SELECT customer_email, SUM(total) AS total_spent
      FROM orders
      WHERE created_at BETWEEN ? AND ?
      GROUP BY customer_email
    ) AS spending
    GROUP BY customer_group
  `;

  try {
    const [results] = await db.query(sql, [from_date, to_date]);
    res.json({ data: results });
  } catch (err) {
    console.error("Error in /customers:", err);
    res.status(500).json({ error: "Lỗi server khi lấy thống kê khách hàng" });
  }
});

module.exports = router;
