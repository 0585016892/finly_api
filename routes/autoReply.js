// routes/autoReply.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../db");

// Cấu hình lưu file
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Lấy danh sách từ khoá
router.get("/", (req, res) => {
  const { keyword } = req.query;
  const sql = keyword
    ? "SELECT * FROM chatbot_replies WHERE keyword LIKE ?"
    : "SELECT * FROM chatbot_replies";
  const values = keyword ? [`%${keyword}%`] : [];

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json({ success: false, err });
    res.json(result);
  });
});

// Thêm từ khoá
router.post("/add", (req, res) => {
  const { keyword, reply } = req.body;
  const sql = "INSERT INTO chatbot_replies (keyword, reply) VALUES (?, ?)";
  db.query(sql, [keyword, reply], (err, result) => {
    if (err) return res.status(500).json({ success: false, err });
    res.json({ success: true });
  });
});

// Cập nhật từ khoá
router.put("/update/:id", (req, res) => {
  const { keyword, reply } = req.body;
  const sql = "UPDATE chatbot_replies SET keyword = ?, reply = ? WHERE id = ?";
  db.query(sql, [keyword, reply, req.params.id], (err, result) => {
    if (err) return res.status(500).json({ success: false, err });
    res.json({ success: true });
  });
});

// Xoá từ khoá
router.delete("/delete/:id", (req, res) => {
  db.query("DELETE FROM chatbot_replies WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, err });
    res.json({ success: true });
  });
});

router.post("/import-excel", upload.single("file"), (req, res) => {
    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
  
      const values = data.map((row) => [row.keyword, row.reply]);
  
      const sql = "INSERT INTO auto_reply (keyword, reply) VALUES ?";
      db.query(sql, [values], (err, result) => {
        if (err) {
          console.error("❌ Import lỗi:", err);
          return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, inserted: result.affectedRows });
      });
    } catch (err) {
      console.error("❌ Lỗi xử lý file Excel:", err);
      res.status(500).json({ success: false, error: "Định dạng file không hợp lệ" });
    }
  });

module.exports = router;
