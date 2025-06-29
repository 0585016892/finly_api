const express = require("express");
const router = express.Router();
const db = require("../db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Middleware xác thực token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Thiếu token" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
}

// 1. Lấy thông tin người dùng
router.get("/me", authenticate, async (req, res) => {
  try {
    const [results] = await db
      .promise()
      .query(
        `SELECT id, full_name, email, phone, address FROM customers WHERE id = ?`,
        [req.user.id]
      );

    if (results.length === 0)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json(results[0]);
  } catch {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 2. Lịch sử đơn hàng
router.get("/orders", authenticate, async (req, res) => {
  const { email } = req.user;
  const status = req.query.status;
  const allowed = ["Đã giao", "Đã hủy", "Chờ xử lý", "Đang giao"];

  const condition =
    status && allowed.includes(status)
      ? "AND status = ?"
      : "AND status IN ('Đã giao', 'Đã hủy', 'Chờ xử lý', 'Đang giao')";
  const statusParam = status && allowed.includes(status) ? [status] : [];

  try {
    const [orders] = await db
      .promise()
      .query(
        `SELECT id, final_total, status, created_at, shipping FROM orders WHERE customer_email = ? ${condition} ORDER BY created_at DESC`,
        [email, ...statusParam]
      );

    if (orders.length === 0) return res.json([]);

    const ids = orders.map((o) => o.id);
    const [details] = await db
      .promise()
      .query(
        `SELECT od.order_id, p.name, od.quantity, od.price, od.size, od.color FROM order_items od JOIN products p ON od.product_id = p.id WHERE od.order_id IN (?)`,
        [ids]
      );

    const result = orders.map((order) => ({
      ...order,
      items: details.filter((d) => d.order_id === order.id),
    }));

    res.json(result);
  } catch {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 3. Chi tiết đơn hàng
router.get("/orders/:orderId", authenticate, async (req, res) => {
  try {
    const [orders] = await db
      .promise()
      .query(
        `SELECT id, code, total_price, status, created_at, shipping FROM orders WHERE id = ? AND customer_email = ?`,
        [req.params.orderId, req.user.email]
      );

    if (orders.length === 0)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    const [items] = await db
      .promise()
      .query(
        `SELECT p.name, od.quantity, od.price, od.size, od.color FROM order_items od JOIN products p ON od.product_id = p.id WHERE od.order_id = ?`,
        [req.params.orderId]
      );

    res.json({ ...orders[0], items });
  } catch {
    res.status(500).json({ message: "Lỗi khi lấy chi tiết đơn hàng" });
  }
});

// 4. Cập nhật thông tin
router.put("/update", authenticate, async (req, res) => {
  const { full_name, phone, address } = req.body;

  if (!full_name || !phone || !address)
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });

  try {
    const [result] = await db
      .promise()
      .query(
        `UPDATE customers SET full_name = ?, phone = ?, address = ? WHERE id = ?`,
        [full_name, phone, address, req.user.id]
      );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });

    res.json({ message: "Cập nhật thông tin thành công" });
  } catch {
    res.status(500).json({ message: "Lỗi khi cập nhật" });
  }
});

// 5. Đổi mật khẩu
router.put("/change-password", authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword)
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });

  try {
    const [rows] = await db
      .promise()
      .query(`SELECT password FROM customers WHERE id = ?`, [req.user.id]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Người dùng không tồn tại" });

    const isMatch = await bcrypt.compare(oldPassword, rows[0].password);
    if (!isMatch)
      return res.status(401).json({ message: "Mật khẩu cũ không đúng" });

    const newHashed = await bcrypt.hash(newPassword, 10);
    await db
      .promise()
      .query(`UPDATE customers SET password = ? WHERE id = ?`, [
        newHashed,
        req.user.id,
      ]);

    res.json({ message: "Đổi mật khẩu thành công" });
  } catch {
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

module.exports = router;
