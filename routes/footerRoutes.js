const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");

// Cấu hình multer để lưu ảnh vào thư mục 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Lấy danh sách footer cha
router.get("/parents", async (req, res) => {
  try {
    const [footerP] = await db
      .promise()
      .query(
        "SELECT * FROM footer_items WHERE parent_id IS NULL OR parent_id = 0"
      );
    res.json({ footerP });
  } catch (err) {
    res.status(500).json({ error: "Lỗi khi lấy danh mục" });
  }
});

// Lấy tất cả footer hoặc lọc theo từ khóa
router.get("/", async (req, res) => {
  const { keyword = "", page = 1, limit = 10 } = req.query;
  const currentPage = parseInt(page);
  const perPage = parseInt(limit);

  try {
    let query = "SELECT * FROM footer_items WHERE 1";
    const params = [];

    if (keyword) {
      query += " AND title LIKE ?";
      params.push(`%${keyword}%`);
    }

    const [allFooters] = await db.promise().query(query, params);

    const footerMap = {};
    const groupedParents = [];

    allFooters.forEach((item) => {
      if (item.parent_id === null || item.parent_id === 0) {
        footerMap[item.id] = { ...item, children: [] };
        groupedParents.push(footerMap[item.id]);
      }
    });

    allFooters.forEach((item) => {
      if (item.parent_id !== null && footerMap[item.parent_id]) {
        footerMap[item.parent_id].children.push(item);
      }
    });

    const totalFooters = groupedParents.length;
    const totalPages = Math.ceil(totalFooters / perPage);
    const paginatedParents = groupedParents.slice(
      (currentPage - 1) * perPage,
      currentPage * perPage
    );

    res.json({
      footers: paginatedParents,
      totalFooters,
      totalPages,
      currentPage,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách footer:", error);
    res.status(500).json({ message: "Lỗi server khi lấy footer." });
  }
});

// Thêm footer
router.post("/add", upload.none(), async (req, res) => {
  const { title, label, value, type, parent_id, status } = req.body;

  if (!title || !label || !value || !type || !status) {
    return res.status(400).json({
      error: "Vui lòng nhập đầy đủ tên, slug và trạng thái danh mục.",
    });
  }

  const sql = `INSERT INTO footer_items (title, label, value, type, parent_id, status) VALUES (?, ?, ?, ?, ?, ?)`;

  try {
    const [result] = await db
      .promise()
      .query(sql, [title, label, value, type, parent_id, status]);
    res.status(201).json({
      message: "✅ Footer đã được thêm thành công!",
      category_id: result.insertId,
    });
  } catch (err) {
    console.error("❌ Lỗi khi thêm danh mục:", err);
    res
      .status(500)
      .json({ error: "Đã xảy ra lỗi khi thêm danh mục vào cơ sở dữ liệu." });
  }
});

// Cập nhật footer theo ID
router.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const { title, label, status } = req.body;

  if (!title || !status) {
    return res
      .status(400)
      .json({ error: "Tiêu đề, và trạng thái là bắt buộc." });
  }

  const sql = `UPDATE footer_items SET title = ?, label = ?, status = ? WHERE id = ?`;

  try {
    const [result] = await db.promise().query(sql, [title, label, status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Không tìm thấy với ID này." });
    }

    res
      .status(200)
      .json({ message: "✅ Cập nhật thành công!", updated_footer_id: id });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật:", err);
    res.status(500).json({ error: "Lỗi khi cập nhật vào cơ sở dữ liệu." });
  }
});

// Xóa footer theo ID (bao gồm cả con)
router.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `DELETE FROM footer_items WHERE id = ? OR parent_id = ?`;
    const [result] = await db.promise().query(sql, [id, id]);

    if (result.affectedRows > 0) {
      return res.json({ message: "Đã xóa mục cha và tất cả mục con." });
    } else {
      return res.status(404).json({ message: "Không tìm thấy mục để xóa." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// Lấy footer theo ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const query = "SELECT * FROM footer_items WHERE id = ?";

  try {
    const [result] = await db.promise().query(query, [id]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Footer not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// Cập nhật trạng thái footer
router.patch("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== "active" && status !== "inactive") {
    return res.status(400).json({
      message:
        "Invalid status value. It should be either 'active' or 'inactive'.",
    });
  }

  const query = "UPDATE footer_items SET status = ? WHERE id = ?";

  try {
    const [result] = await db.promise().query(query, [status, id]);

    if (result.affectedRows > 0) {
      return res.json({ success: true });
    } else {
      res.status(404).json({ message: "Footer not found" });
    }
  } catch (err) {
    console.error("Error updating footer status:", err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
