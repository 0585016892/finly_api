const express = require("express");
const router = express.Router();
const db = require("../db");
const { promisify } = require("util");

const query = promisify(db.query).bind(db);

// Lấy danh sách khách hàng có phân trang và tìm kiếm
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    let whereClause = "WHERE 1 = 1";

    if (req.query.status) {
      whereClause += ` AND status = ${db.escape(req.query.status)}`;
    }
    if (req.query.keyword) {
      whereClause += ` AND full_name LIKE ${db.escape(
        "%" + req.query.keyword + "%"
      )}`;
    }

    const countSql = `SELECT COUNT(*) AS total FROM customers ${whereClause}`;
    const dataSql = `SELECT * FROM customers ${whereClause} LIMIT ${limit} OFFSET ${offset}`;

    const countResults = await query(countSql);
    const totalCustomers = countResults[0].total;
    const totalPages = Math.ceil(totalCustomers / limit);
    const customers = await query(dataSql);

    res.status(200).json({
      customers,
      totalCustomers,
      totalPages,
      currentPage: page,
    });
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách khách hàng:", err);
    res.status(500).json({ error: "Lỗi khi lấy danh sách khách hàng." });
  }
});

// Thêm khách hàng
router.post("/add", async (req, res) => {
  try {
    const { full_name, email, phone, address } = req.body;
    if (!full_name || !email) {
      return res.status(400).json({ error: "Tên và Email là bắt buộc" });
    }

    const sql = `INSERT INTO customers (full_name, email, phone, address) VALUES (?, ?, ?, ?)`;
    const result = await query(sql, [full_name, email, phone, address]);

    res.status(201).json({
      message: "✅ Thêm thành công",
      customer_id: result.insertId,
    });
  } catch (err) {
    console.error("❌ Lỗi khi thêm khách hàng:", err);
    res.status(500).json({ error: "Thêm khách hàng thất bại" });
  }
});

// Sửa khách hàng
router.put("/update/:id", async (req, res) => {
  try {
    const { full_name, email, phone, address } = req.body;
    const sql = `
      UPDATE customers
      SET full_name = ?, email = ?, phone = ?, address = ?
      WHERE id = ?
    `;
    await query(sql, [full_name, email, phone, address, req.params.id]);
    res.json({ message: "✅ Cập nhật thành công" });
  } catch (err) {
    res.status(500).json({ error: "Cập nhật thất bại", details: err.message });
  }
});

// Xoá khách hàng
router.delete("/delete/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM customers WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "❌ Không tìm thấy khách hàng để xoá" });
    }
    res.json({ message: "✅ Đã xoá khách hàng" });
  } catch (err) {
    res.status(500).json({ error: "Xoá thất bại", details: err.message });
  }
});

// Cập nhật trạng thái khách hàng
router.patch("/update_status/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    const allowed = ["active", "inactive"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    }

    const result = await query("UPDATE customers SET status = ? WHERE id = ?", [
      status,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy khách hàng với ID này" });
    }

    res.json({
      message: `✅ Cập nhật trạng thái khách hàng với ID ${id} thành ${status}`,
    });
  } catch (err) {
    console.error("❌ Lỗi cập nhật trạng thái:", err);
    res.status(500).json({ error: "Lỗi khi cập nhật trạng thái" });
  }
});

// Chi tiết khách hàng + đơn hàng đã mua
router.get("/details/:id", async (req, res) => {
  try {
    const customerId = req.params.id;

    const customerResult = await query("SELECT * FROM customers WHERE id = ?", [
      customerId,
    ]);
    if (customerResult.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy khách hàng." });
    }

    const customer = customerResult[0];
    const sqlOrders = `
      SELECT 
        orders.id AS order_id, orders.created_at,
        sanpham.name, sanpham.image, order_items.quantity, order_items.size, order_items.color, order_items.price
      FROM orders
      JOIN order_items ON orders.id = order_items.order_id
      JOIN sanpham ON order_items.product_id = sanpham.id
      WHERE orders.customer_id = ?
      ORDER BY orders.created_at DESC
    `;
    const orders = await query(sqlOrders, [customerId]);

    res.json({ customer, orders });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi lấy chi tiết khách hàng", details: err.message });
  }
});

module.exports = router;
