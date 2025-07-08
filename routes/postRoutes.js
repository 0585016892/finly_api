const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Cấu hình nơi lưu ảnh
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "public/uploads/posts";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Middleware để xử lý JSON và x-www-form-urlencoded
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Thêm bài viết mới với nhiều ảnh
router.post("/", upload.array("images", 10), (req, res) => {
  const { title, slug, content, category, status } = req.body;
  const imageUrls = req.files.map((file) => `/uploads/posts/${file.filename}`);

  const insertPost = `
    INSERT INTO posts (title, slug, content, category, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  `;
  db.query(insertPost, [title, slug, content, category, status], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err });

    const postId = result.insertId;
    if (imageUrls.length > 0) {
      const insertImages = `INSERT INTO post_images (post_id, image_url) VALUES ?`;
      const imageData = imageUrls.map((url) => [postId, url]);
      db.query(insertImages, [imageData], (imgErr) => {
        if (imgErr) return res.status(500).json({ success: false, imgErr });
        res.json({ success: true, message: "Thêm bài viết thành công" });
      });
    } else {
      res.json({ success: true, message: "Thêm bài viết (không có ảnh) thành công" });
    }
  });
});

// Lấy danh sách bài viết (kèm ảnh)
router.get("/", (req, res) => {
  const { keyword = "", page = 1, limit = 6 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Câu query chính lấy dữ liệu có phân trang + lọc
  const dataQuery = `
    SELECT p.*, GROUP_CONCAT(pi.image_url) AS images
    FROM posts p
    LEFT JOIN post_images pi ON pi.post_id = p.id
    WHERE p.title LIKE ? OR p.category LIKE ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  // Câu query đếm tổng số bài viết thỏa mãn điều kiện lọc
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM posts p
    WHERE p.title LIKE ? OR p.category LIKE ?
  `;

  const searchKeyword = `%${keyword}%`;

  // Lấy tổng số bài viết
  db.query(countQuery, [searchKeyword, searchKeyword], (err, countResult) => {
    if (err) return res.status(500).json({ success: false, err });

    const totalPosts = countResult[0].total;
    const totalPages = Math.ceil(totalPosts / limit);

    // Lấy danh sách bài viết
    db.query(dataQuery, [searchKeyword, searchKeyword, parseInt(limit), offset], (err, results) => {
      if (err) return res.status(500).json({ success: false, err });

      const formatted = results.map((row) => ({
        ...row,
        images: row.images ? row.images.split(",") : [],
      }));

      res.json({
        success: true,
        posts: formatted,
        totalPosts,
        totalPages,
      });
    });
  });
});


// Lấy chi tiết 1 bài viết
router.get("/:id", (req, res) => {
  const postId = req.params.id;
  const query = `
    SELECT p.*, GROUP_CONCAT(pi.image_url) AS images
    FROM posts p
    LEFT JOIN post_images pi ON pi.post_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
  `;
  
  db.query(query, [postId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết" });
    }

    const post = results[0];
    post.images = post.images ? post.images.split(",") : [];
    res.json(post);
  });
});


router.get("/slug/:slug", (req, res) => {
  const slug = req.params.slug;

  const query = `
    SELECT p.*, GROUP_CONCAT(pi.image_url) AS images
    FROM posts p
    LEFT JOIN post_images pi ON pi.post_id = p.id
    WHERE p.slug = ?
    GROUP BY p.id
  `;

  db.query(query, [slug], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy bài viết theo slug:", err);
      return res.status(500).json({ success: false, message: "Lỗi server" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết" });
    }

    const post = results[0];
    post.images = post.images ? post.images.split(",") : [];

    res.json({
      success: true,
      post,
    });
  });
});


// Cập nhật bài viết
router.put("/:id", upload.array("images", 10), (req, res) => {
  const postId = req.params.id;
  const { title, slug, content, category, status } = req.body;
  const imageUrls = req.files.map((file) => `/uploads/${file.filename}`);

  const updatePost = `
    UPDATE posts SET title=?, slug=?, content=?, category=?, status=?, updated_at=NOW()
    WHERE id=?
  `;
  db.query(updatePost, [title, slug, content, category, status, postId], (err) => {
    if (err) return res.status(500).json({ success: false, err });

    if (imageUrls.length > 0) {
      const insertImages = `INSERT INTO post_images (post_id, image_url) VALUES ?`;
      const imageData = imageUrls.map((url) => [postId, url]);
      db.query(insertImages, [imageData], (imgErr) => {
        if (imgErr) return res.status(500).json({ success: false, imgErr });
        res.json({ success: true, message: "Cập nhật bài viết thành công" });
      });
    } else {
      res.json({ success: true, message: "Cập nhật bài viết (không đổi ảnh) thành công" });
    }
  });
});

// Xóa bài viết và ảnh kèm theo
router.delete("/:id", (req, res) => {
  const postId = req.params.id;

  // Xóa ảnh vật lý trước
  db.query("SELECT image_url FROM post_images WHERE post_id = ?", [postId], (err, rows) => {
    if (!err && rows.length > 0) {
      rows.forEach((row) => {
        const filePath = path.join(__dirname, "../public", row.image_url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }
  });

  // Xóa bài viết
  db.query("DELETE FROM posts WHERE id = ?", [postId], (err) => {
    if (err) return res.status(500).json({ success: false, err });
    res.json({ success: true, message: "Đã xóa bài viết" });
  });
});
// routes/posts.js
router.patch("/:id/status", (req, res) => {
  const postId = req.params.id;
  const { status } = req.body;

  const query = "UPDATE posts SET status = ? WHERE id = ?";
  db.query(query, [status, postId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Lỗi cập nhật status" });

    res.json({ success: true, message: "Cập nhật trạng thái thành công" });
  });
});
module.exports = router;
