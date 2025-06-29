const express = require("express");
const router = express.Router();
const db = require("../db");

// 📌 GET /api/sizes?page=&limit= => Lấy danh sách size có phân trang
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  try {
    const [[{ total }]] = await db
      .promise()
      .query("SELECT COUNT(*) AS total FROM sizes");
    const [sizes] = await db
      .promise()
      .query("SELECT * FROM sizes LIMIT ? OFFSET ?", [limit, offset]);

    res.json({
      data: sizes,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    console.error("Lỗi truy vấn size:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 📌 GET /api/sizes/all => Lấy toàn bộ size
router.get("/all", async (req, res) => {
  try {
    const [results] = await db.promise().query("SELECT * FROM sizes");
    res.json(results);
  } catch (err) {
    console.error("Lỗi truy vấn tất cả size:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 📌 POST /api/sizes => Thêm size mới
router.post("/", async (req, res) => {
  const { name, active } = req.body;

  if (!name || !active) {
    return res.status(400).json({ error: "Thiếu tên size hoặc trạng thái" });
  }

  try {
    const [result] = await db
      .promise()
      .query("INSERT INTO sizes (name, active) VALUES (?, ?)", [name, active]);
    res.json({ message: "Thêm size thành công", id: result.insertId });
  } catch (err) {
    console.error("Lỗi thêm size:", err);
    res.status(500).json({ error: "Lỗi khi thêm size" });
  }
});

// 📌 PUT /api/sizes/:id => Cập nhật size
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;

  if (!name || !active) {
    return res.status(400).json({ error: "Thiếu tên size hoặc trạng thái" });
  }

  try {
    const [result] = await db
      .promise()
      .query("UPDATE sizes SET name = ?, active = ? WHERE id = ?", [
        name,
        active,
        id,
      ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Không tìm thấy size" });
    }

    res.json({ message: "Cập nhật size thành công" });
  } catch (err) {
    console.error("Lỗi cập nhật size:", err);
    res.status(500).json({ error: "Lỗi khi cập nhật size" });
  }
});

// 📌 DELETE /api/sizes/:id => Xoá size
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db
      .promise()
      .query("DELETE FROM sizes WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Không tìm thấy size" });
    }

    res.json({ message: "Xoá size thành công" });
  } catch (err) {
    console.error("Lỗi xoá size:", err);
    res.status(500).json({ error: "Lỗi khi xoá size" });
  }
});

module.exports = router;
