const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const { promisify } = require("util");

const upload = multer();
const query = promisify(db.query).bind(db);

// Middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// GET danh mục website dạng cha - con
router.get("/danhmucweb", async (req, res) => {
  try {
    const results = await query(`
      SELECT 
        c1.id, c1.name, c1.slug, c1.parent_id, c1.description, c1.status, c1.created_at, c1.updated_at,
        c2.id AS child_id, c2.slug AS child_slug, c2.name AS child_name, c2.description AS child_description,
        c2.status AS child_status, c2.parent_id AS child_parent_id
      FROM categories c1
      LEFT JOIN categories c2 ON c2.parent_id = c1.id AND c2.status = 'active'
      WHERE c1.status = 'active'
      ORDER BY c1.id
    `);

    const parentCategories = [];

    results.forEach((category) => {
      if (category.parent_id === 0 || category.parent_id === null) {
        let parentCategory = parentCategories.find((p) => p.id === category.id);
        if (!parentCategory) {
          parentCategory = {
            id: category.id,
            name: category.name,
            slug: category.slug,
            parent_id: category.parent_id,
            description: category.description,
            status: category.status,
            created_at: category.created_at,
            updated_at: category.updated_at,
            dmCon: [],
          };
          parentCategories.push(parentCategory);
        }

        if (category.child_id !== null) {
          parentCategory.dmCon.push({
            child_id: category.child_id,
            child_slug: category.child_slug,
            child_name: category.child_name,
            child_description: category.child_description,
            child_status: category.child_status,
            child_parent_id: category.child_parent_id,
          });
        }
      }
    });

    res.json(parentCategories);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi lấy danh mục", details: err.message });
  }
});

// GET danh mục cha
router.get("/parents", async (req, res) => {
  try {
    const categories = await query(
      "SELECT * FROM categories WHERE parent_id IS NULL OR parent_id = 0"
    );
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: "Lỗi khi lấy danh mục cha" });
  }
});

// POST: Thêm danh mục mới
router.post("/add", upload.none(), async (req, res) => {
  const { name, slug, parent_id, description, status } = req.body;
  if (!name || !slug || !status) {
    return res.status(400).json({
      error: "Vui lòng nhập đầy đủ tên, slug và trạng thái danh mục.",
    });
  }

  try {
    const sql = `
      INSERT INTO categories (name, slug, parent_id, description, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await query(sql, [
      name,
      slug,
      parent_id || null,
      description || "",
      status,
    ]);
    res.status(201).json({
      message: "✅ Danh mục đã được thêm thành công!",
      category_id: result.insertId,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi thêm danh mục", details: err.message });
  }
});

// GET danh mục có phân trang + lọc
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  let whereClause = "WHERE 1 = 1";

  if (req.query.status) {
    whereClause += ` AND status = ${db.escape(req.query.status)}`;
  }
  if (req.query.keyword) {
    whereClause += ` AND name LIKE ${db.escape(`%${req.query.keyword}%`)}`;
  }

  try {
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM categories ${whereClause}`
    );
    const totalCategories = countResult[0].total;
    const totalPages = Math.ceil(totalCategories / limit);

    const categories = await query(
      `SELECT * FROM categories ${whereClause} LIMIT ${limit} OFFSET ${offset}`
    );

    res.status(200).json({
      categories,
      totalCategories,
      totalPages,
      currentPage: page,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi lấy danh sách danh mục", details: err.message });
  }
});

// GET danh mục theo ID
router.get("/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM categories WHERE id = ?", [
      req.params.id,
    ]);
    if (result.length === 0) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy danh mục với ID này." });
    }
    res.json(result[0]);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi lấy danh mục theo ID", details: err.message });
  }
});

// PUT cập nhật danh mục
router.put("/update/:id", async (req, res) => {
  const { name, slug, description, status } = req.body;
  if (!name || !slug || !status) {
    return res
      .status(400)
      .json({ error: "Tên, slug, và trạng thái là bắt buộc." });
  }

  try {
    const sql = `
      UPDATE categories 
      SET name = ?, slug = ?, description = ?, status = ?
      WHERE id = ?
    `;
    const result = await query(sql, [
      name,
      slug,
      description || "",
      status,
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy danh mục để cập nhật." });
    }

    res.status(200).json({
      message: "✅ Cập nhật danh mục thành công!",
      updated_category_id: req.params.id,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi cập nhật danh mục", details: err.message });
  }
});

// DELETE danh mục
router.delete("/delete/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM categories WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "❌ Không tìm thấy danh mục để xóa." });
    }

    res.status(200).json({ message: `✅ Xóa danh mục thành công!` });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Lỗi khi xóa danh mục", details: err.message });
  }
});

module.exports = router;
