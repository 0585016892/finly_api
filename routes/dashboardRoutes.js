const express = require("express");
const router = express.Router();
const db = require("../db");
const { promisify } = require("util");

const query = promisify(db.query).bind(db);

// Lấy thống kê chính
router.get("/stats", async (req, res) => {
  try {
    const ordersRes = await query("SELECT COUNT(*) AS total FROM orders");
    const totalOrders = ordersRes[0].total;

    const revenueRes = await query(
      "SELECT SUM(final_total) AS total FROM orders WHERE DATE(created_at) = CURDATE()"
    );
    const revenueToday = revenueRes[0].total || 0;

    const productsRes = await query(
      "SELECT COUNT(*) AS total FROM sanpham WHERE status = 'active'"
    );
    const productsCount = productsRes[0].total;

    const customersRes = await query(
      "SELECT COUNT(*) AS total FROM customers WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
    );
    const newCustomers = customersRes[0].total;

    const statsData = [
      {
        label: "Tổng số đơn hàng",
        number: totalOrders,
        helpText: "Cập nhật hôm nay",
      },
      {
        label: "Doanh thu hôm nay",
        number: revenueToday,
        helpText: "Tổng doanh thu",
      },
      {
        label: "Sản phẩm đang bán",
        number: productsCount,
        helpText: "Đang kinh doanh",
      },
      {
        label: "Khách hàng mới",
        number: newCustomers,
        helpText: "Trong tuần",
      },
    ];

    res.json(statsData);
  } catch (err) {
    console.error("Lỗi lấy thống kê:", err);
    res.status(500).json({ message: "Lỗi server khi lấy thống kê" });
  }
});

// Thống kê doanh thu theo ngày (lọc theo khoảng thời gian)
router.get("/revenue", async (req, res) => {
  const { from_date, to_date } = req.query;

  const isValidDate = (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (
    (from_date && !isValidDate(from_date)) ||
    (to_date && !isValidDate(to_date))
  ) {
    return res
      .status(400)
      .json({ error: "from_date hoặc to_date sai định dạng YYYY-MM-DD" });
  }

  const sql = `
    SELECT 
      DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
      IFNULL(SUM(final_total), 0) AS revenue
    FROM orders
    WHERE (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?)
    GROUP BY date
    ORDER BY date
  `;

  const params = [
    from_date || null,
    from_date || null,
    to_date || null,
    to_date || null,
  ];

  try {
    const results = await query(sql, params);
    res.json(results);
  } catch (err) {
    console.error("Lỗi lấy doanh thu:", err);
    res.status(500).json({ error: "Lỗi server khi lấy dữ liệu doanh thu" });
  }
});

// Lấy danh sách đơn hàng gần nhất
router.get("/orders", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const sql = `
    SELECT 
      id, 
      customer_email AS customer, 
      final_total AS total, 
      status, 
      DATE_FORMAT(created_at, '%Y-%m-%d') AS date
    FROM orders
    ORDER BY created_at DESC
    LIMIT ?
  `;

  try {
    const results = await query(sql, [limit]);
    res.json({ data: results });
  } catch (err) {
    console.error("Lỗi lấy đơn hàng:", err);
    res.status(500).json({ error: "Lỗi server khi lấy đơn hàng" });
  }
});

module.exports = router;
