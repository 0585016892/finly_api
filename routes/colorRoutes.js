const express = require("express");
const router = express.Router();
const db = require("../db");
const { promisify } = require("util");

const query = promisify(db.query).bind(db);

// Lấy danh sách màu có phân trang
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const countQuery = "SELECT COUNT(*) AS total FROM colors";
    const dataQuery = "SELECT * FROM colors ORDER BY id DESC LIMIT ? OFFSET ?";

    const countResult = await query(countQuery);
    const dataResult = await query(dataQuery, [limit, offset]);

    res.json({
      total: countResult[0].total,
      data: dataResult,
      currentPage: page,
      totalPages: Math.ceil(countResult[0].total / limit),
    });
  } catch (err) {
    console.error("❌ Lỗi truy vấn danh sách màu:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi truy vấn màu" });
  }
});

// Lấy tất cả màu (không phân trang)
router.get("/all", async (req, res) => {
  try {
    const results = await query("SELECT * FROM colors ORDER BY id DESC");
    res.json(results);
  } catch (err) {
    console.error("❌ Lỗi khi lấy tất cả màu:", err);
    res.status(500).json({ message: "Lỗi khi lấy dữ liệu màu" });
  }
});

// Thêm màu mới
router.post("/", async (req, res) => {
  try {
    const { name, code, status } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Tên màu là bắt buộc" });
    }

    const insertQuery =
      "INSERT INTO colors (name, code, status) VALUES (?, ?, ?)";
    const result = await query(insertQuery, [name, code, status]);

    res.json({ message: "✅ Thêm màu thành công", id: result.insertId });
  } catch (err) {
    console.error("❌ Lỗi khi thêm màu:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi thêm màu" });
  }
});

// Cập nhật màu
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, status } = req.body;

    const updateQuery =
      "UPDATE colors SET name = ?, code = ?, status = ? WHERE id = ?";
    await query(updateQuery, [name, code, status, id]);

    res.json({ message: "✅ Cập nhật màu thành công" });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật màu:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi cập nhật màu" });
  }
});

// Xóa màu
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleteQuery = "DELETE FROM colors WHERE id = ?";
    await query(deleteQuery, [id]);

    res.json({ message: "✅ Xóa màu thành công" });
  } catch (err) {
    console.error("❌ Lỗi khi xóa màu:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi xóa màu" });
  }
});

module.exports = router;
