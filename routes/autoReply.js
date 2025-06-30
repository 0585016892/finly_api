// routes/autoReply.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
  db.query(
    "DELETE FROM chatbot_replies WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ success: false, err });
      res.json({ success: true });
    }
  );
});

router.post("/import-excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Không có file được tải lên" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log("📄 Dữ liệu đọc từ Excel:", data); // ✅ debug

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "File không chứa dữ liệu hợp lệ" });
    }

    const values = data.map((row) => [row.keyword, row.reply]);

    const sql = "INSERT INTO chatbot_replies (keyword, reply) VALUES ?";
    db.query(sql, [values], (err, result) => {
      if (err) {
        console.error("❌ Import lỗi:", err);
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, inserted: result.affectedRows });
    });
  } catch (err) {
    console.error("❌ Lỗi xử lý file Excel:", err);
    res
      .status(500)
      .json({ success: false, error: "Định dạng file không hợp lệ" });
  }
});
// API: Tự động sinh rule từ GPT và lưu vào DB
router.get("/suggest-gpt", async (req, res) => {
  try {
    const prompt = `
Bạn là nhân viên tư vấn bán quần áo online.
Hãy tạo 5 cặp câu hỏi thường gặp (FAQ) và câu trả lời lịch sự, thân thiện từ khách hàng về sản phẩm, giao hàng, đổi trả, size.
Trả kết quả dưới dạng JSON: [{"keyword": "...", "reply": "..."}, ...]
`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Bạn là trợ lý tư vấn bán hàng chuyên nghiệp.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content;

    // Cố gắng parse JSON
    const rules = JSON.parse(content);

    if (!Array.isArray(rules)) {
      return res
        .status(400)
        .json({ success: false, message: "Phản hồi GPT không đúng định dạng" });
    }

    const values = rules.map((r) => [r.keyword, r.reply]);

    const sql = "INSERT INTO chatbot_replies (keyword, reply) VALUES ?";
    db.query(sql, [values], (err, result) => {
      if (err) {
        console.error("❌ Lỗi khi lưu rule:", err);
        return res
          .status(500)
          .json({ success: false, message: "Lưu rule thất bại" });
      }

      res.json({ success: true, inserted: result.affectedRows, rules });
    });
  } catch (err) {
    console.error("GPT error:", err);
    res.status(500).json({ success: false, message: "Lỗi khi gọi GPT" });
  }
});
module.exports = router;
