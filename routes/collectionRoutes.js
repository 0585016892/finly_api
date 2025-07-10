const express = require("express");
const router = express.Router();
const db = require("../db"); // Kết nối MySQL
const multer = require("multer");
const path = require("path");

// Cấu hình lưu file
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Thêm collection
router.post("/", upload.single("image"), (req, res) => {
  const { name, description, status } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const image = req.file ? req.file.filename : null;

  db.query(
    "INSERT INTO collections (name, slug, description, image, status) VALUES (?, ?, ?, ?, ?)",
    [name, slug, description, image, status],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ success: true, message: "Thêm thành công!" });
    }
  );
});

// Lấy danh sách collection có lọc + phân trang
router.get("/", (req, res) => {
  const { search = "", status = "", page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let sql = "SELECT * FROM collections WHERE 1=1";
  let params = [];

  if (search) {
    sql += " AND name LIKE ?";
    params.push(`%${search}%`);
  }

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err });

    db.query("SELECT COUNT(*) as total FROM collections WHERE 1=1"
      + (search ? " AND name LIKE ?" : "")
      + (status ? " AND status = ?" : ""),
      params.slice(0, params.length - 2), // Count dùng cùng params
      (err2, countRes) => {
        if (err2) return res.status(500).json({ error: err2 });

        res.json({
          data: results,
          total: countRes[0].total,
          page: Number(page),
          totalPages: Math.ceil(countRes[0].total / limit)
        });
      });
  });
});

// Lấy 1 collection
router.get("/:id", (req, res) => {
  db.query("SELECT * FROM collections WHERE id = ?", [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results[0]);
  });
});

// Cập nhật collection
router.put("/:id", upload.single("image"), (req, res) => {
  const { name, description, status } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const image = req.file ? req.file.filename : null;

  let sql = "UPDATE collections SET name = ?, slug = ?, description = ?, status = ?";
  let params = [name, slug, description, status];

  if (image) {
    sql += ", image = ?";
    params.push(image);
  }

  sql += " WHERE id = ?";
  params.push(req.params.id);

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true, message: "Cập nhật thành công!" });
  });
});

// Xóa collection
router.delete("/delete/:id", (req, res) => {
  db.query("DELETE FROM collections WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true, message: "Xóa thành công!" });
  });
});

// Cập nhật status riêng
router.patch("/:id/status", (req, res) => {
  const { status } = req.body;
  db.query("UPDATE collections SET status = ? WHERE id = ?", [status, req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true, message: "Cập nhật trạng thái thành công!" });
  });
});

module.exports = router;
