const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// 1. Lấy tất cả slide (web client)
router.get("/show", async (req, res) => {
  const { display_area } = req.query;

  try {
    let query = "SELECT * FROM slides WHERE 1";
    const params = [];

    if (display_area) {
      query += " AND display_area = ?";
      params.push(display_area);
    }

    query += " ORDER BY id DESC";
    const [slides] = await db.promise().query(query, params);

    res.json({ slides });
  } catch (err) {
    console.error("Lỗi lấy slide:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 2. Lấy danh sách slide có phân trang + tìm kiếm
router.get("/", async (req, res) => {
  const { display_area, keyword, page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];

  try {
    let baseQuery = "FROM slides WHERE 1";

    if (display_area) {
      baseQuery += " AND display_area = ?";
      params.push(display_area);
    }

    if (keyword) {
      baseQuery += " AND title LIKE ?";
      params.push(`%${keyword}%`);
    }

    const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
    const [[{ total }]] = await db.promise().query(countQuery, params);

    const dataQuery = `SELECT * ${baseQuery} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const [slides] = await db
      .promise()
      .query(dataQuery, [...params, parseInt(limit), offset]);

    res.json({
      slides,
      totalSlides: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    });
  } catch (err) {
    console.error("Lỗi phân trang slide:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 3. Thêm slide
router.post("/add", upload.single("image"), async (req, res) => {
  const { title, link, status, position, display_area, start_date, end_date } =
    req.body;
  const image = req.file?.filename;

  if (!image) return res.status(400).json({ message: "Image is required" });

  const query = `
    INSERT INTO slides (title, image, link, status, position, display_area, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await db
      .promise()
      .query(query, [
        title,
        image,
        link,
        status,
        position,
        display_area,
        start_date,
        end_date,
      ]);
    res.status(201).json({ message: "Slide added successfully" });
  } catch (err) {
    console.error("Lỗi thêm slide:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 4. Cập nhật slide
router.put("/update/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { title, link, status, position, display_area, start_date, end_date } =
    req.body;
  const image = req.file?.filename;
  const values = [
    title,
    link,
    status,
    position,
    display_area,
    start_date,
    end_date,
  ];
  let query = `
    UPDATE slides
    SET title = ?, link = ?, status = ?, position = ?, display_area = ?, start_date = ?, end_date = ?
  `;

  try {
    if (image) {
      const [[oldSlide]] = await db
        .promise()
        .query("SELECT image FROM slides WHERE id = ?", [id]);

      if (!oldSlide)
        return res.status(404).json({ message: "Slide not found" });

      const oldImagePath = path.join(
        __dirname,
        "..",
        "public",
        "uploads",
        oldSlide.image
      );
      if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);

      query += ", image = ?";
      values.push(image);
    }

    query += " WHERE id = ?";
    values.push(id);

    const [result] = await db.promise().query(query, values);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Slide not found" });

    res.json({ message: "Slide updated successfully" });
  } catch (err) {
    console.error("Lỗi cập nhật slide:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 5. Xoá slide
router.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [[slide]] = await db
      .promise()
      .query("SELECT image FROM slides WHERE id = ?", [id]);
    if (!slide) return res.status(404).json({ message: "Slide not found" });

    const imagePath = path.join(
      __dirname,
      "..",
      "public",
      "uploads",
      slide.image
    );
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    const [result] = await db
      .promise()
      .query("DELETE FROM slides WHERE id = ?", [id]);
    res.json({ message: "Slide deleted successfully" });
  } catch (err) {
    console.error("Lỗi xoá slide:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 6. Lấy slide theo ID
router.get("/:id", async (req, res) => {
  try {
    const [result] = await db
      .promise()
      .query("SELECT * FROM slides WHERE id = ?", [req.params.id]);
    if (result.length === 0)
      return res.status(404).json({ message: "Slide not found" });

    res.json(result[0]);
  } catch (err) {
    console.error("Lỗi lấy slide theo ID:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// 7. Cập nhật trạng thái slide
router.patch("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "inactive"].includes(status)) {
    return res
      .status(400)
      .json({
        message: "Invalid status value. Must be 'active' or 'inactive'.",
      });
  }

  try {
    const [result] = await db
      .promise()
      .query("UPDATE slides SET status = ? WHERE id = ?", [status, id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Slide not found" });

    res.json({ message: "Slide status updated successfully" });
  } catch (err) {
    console.error("Lỗi cập nhật trạng thái:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
