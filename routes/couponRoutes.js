const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const { promisify } = require("util");

const upload = multer();
const query = promisify(db.query).bind(db);

// Lấy danh sách coupon có lọc và phân trang
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1 = 1";

    if (req.query.status) {
      whereClause += ` AND status = ${db.escape(req.query.status)}`;
    }
    if (req.query.code) {
      whereClause += ` AND code LIKE ${db.escape("%" + req.query.code + "%")}`;
    }
    if (req.query.discount_type) {
      whereClause += ` AND discount_type = ${db.escape(
        req.query.discount_type
      )}`;
    }
    if (req.query.min_order_total) {
      whereClause += ` AND min_order_total >= ${db.escape(
        req.query.min_order_total
      )}`;
    }

    const sqlCount = `SELECT COUNT(*) AS total FROM coupons ${whereClause}`;
    const sqlCoupons = `SELECT * FROM coupons ${whereClause} LIMIT ${limit} OFFSET ${offset}`;

    const countResults = await query(sqlCount);
    const totalCoupons = countResults[0].total;
    const totalPages = Math.ceil(totalCoupons / limit);
    const coupons = await query(sqlCoupons);

    res.status(200).json({
      coupons,
      totalCoupons,
      totalPages,
      currentPage: page,
    });
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách coupon:", err);
    res.status(500).json({ error: "Lỗi khi lấy danh sách mã giảm giá." });
  }
});

// Thêm coupon
router.post("/add", upload.none(), async (req, res) => {
  try {
    const {
      code,
      description,
      discount_type,
      discount_value,
      min_order_total,
      start_date,
      end_date,
      quantity,
      status,
    } = req.body;

    if (!code || !discount_value || !start_date || !end_date) {
      return res.status(400).json({
        error: "Mã, giá trị, ngày bắt đầu, ngày kết thúc là bắt buộc.",
      });
    }

    const sql = `
      INSERT INTO coupons 
      (code, description, discount_type, discount_value, min_order_total, start_date, end_date, quantity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await query(sql, [
      code,
      description || "",
      discount_type,
      discount_value,
      min_order_total,
      start_date,
      end_date,
      quantity,
      status || "active",
    ]);

    res.status(201).json({
      message: "✅ Coupon đã được thêm thành công!",
      coupon_id: result.insertId,
    });
  } catch (err) {
    console.error("❌ Lỗi khi thêm coupon:", err);
    res.status(500).json({
      error: "Lỗi khi thêm mã giảm giá.",
      details: err.message,
    });
  }
});

// Cập nhật coupon
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      description,
      discount_type,
      discount_value,
      min_order_total,
      start_date,
      end_date,
      quantity,
      status,
    } = req.body;

    const updateSql = `
      UPDATE coupons 
      SET code = ?, description = ?, discount_type = ?, discount_value = ?, 
          min_order_total = ?, start_date = ?, end_date = ?, quantity = ?, status = ?
      WHERE id = ?
    `;

    await query(updateSql, [
      code,
      description,
      discount_type,
      discount_value,
      min_order_total,
      start_date,
      end_date,
      quantity,
      status,
      id,
    ]);

    const updatedCoupon = await query("SELECT * FROM coupons WHERE id = ?", [
      id,
    ]);

    res.json({
      message: "✅ Cập nhật thành công!",
      updatedCoupon: updatedCoupon[0],
    });
  } catch (err) {
    console.error("❌ Lỗi cập nhật coupon:", err);
    res.status(500).json({ message: "Lỗi khi cập nhật mã giảm giá." });
  }
});

// Xóa coupon
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM coupons WHERE id = ?", [id]);
    res.json({ message: "✅ Đã xoá mã giảm giá!" });
  } catch (err) {
    console.error("❌ Lỗi xoá coupon:", err);
    res.status(500).json({ error: "Xoá coupon thất bại." });
  }
});

// Cập nhật trạng thái coupon
router.patch("/update-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }

    await query("UPDATE coupons SET status = ? WHERE id = ?", [status, id]);

    const updated = await query("SELECT * FROM coupons WHERE id = ?", [id]);

    res.json({
      message: "✅ Cập nhật trạng thái thành công!",
      updatedCoupon: updated[0],
    });
  } catch (err) {
    console.error("❌ Lỗi cập nhật trạng thái:", err);
    res.status(500).json({ message: "Lỗi khi cập nhật trạng thái." });
  }
});

// Trừ quantity coupon khi sử dụng
router.patch("/use/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "UPDATE coupons SET quantity = quantity - 1 WHERE id = ? AND quantity > 0",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "Không thể sử dụng mã này nữa." });
    }

    res.json({ message: "✅ Đã sử dụng mã thành công." });
  } catch (err) {
    console.error("❌ Lỗi khi sử dụng mã:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi sử dụng mã." });
  }
});

module.exports = router;
