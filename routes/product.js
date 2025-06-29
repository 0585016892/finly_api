const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: storage });

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get("/category/:slug", async (req, res) => {
  try {
    const [categoryResults] = await db.query(
      "SELECT * FROM categories WHERE slug = ?",
      [req.params.slug]
    );
    if (categoryResults.length === 0)
      return res.status(404).send("Category not found");

    const category = categoryResults[0];
    const [productResults] = await db.query(
      `SELECT sanpham.*, coupons.discount_type, coupons.discount_value
       FROM sanpham
       LEFT JOIN coupons ON sanpham.coupon_id = coupons.id
       WHERE sanpham.categoryId = ?`,
      [category.id]
    );

    res.json({ categoryTitle: category.name, products: productResults });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

router.get("/products/:slug", async (req, res) => {
  try {
    const [results] = await db.query(
      `SELECT sanpham.*, coupons.discount_type, coupons.discount_value
       FROM sanpham
       LEFT JOIN coupons ON sanpham.coupon_id = coupons.id
       WHERE slug = ?`,
      [req.params.slug]
    );

    if (results.length === 0)
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

    const product = results[0];
    const [subImages] = await db.query(
      "SELECT image_path FROM product_images WHERE product_id = ?",
      [product.id]
    );
    product.subImages = subImages.map((row) => row.image_path);
    res.json(product);
  } catch (err) {
    console.error("❌ Lỗi khi lấy sản phẩm:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const keyword = req.query.keyword || "";
    const [results] = await db.query(
      "SELECT * FROM sanpham WHERE name LIKE ?",
      [`%${keyword}%`]
    );
    res.json(results);
  } catch (err) {
    console.error("Lỗi khi tìm kiếm sản phẩm:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/danhmuc", async (req, res) => {
  try {
    const [categories] = await db.query(
      "SELECT * FROM categories WHERE parent_id != 0"
    );
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: "Lỗi khi lấy danh mục" });
  }
});

router.post(
  "/add",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "subImages", maxCount: 10 },
  ]),
  async (req, res) => {
    const {
      name,
      slug,
      description,
      quantity,
      size,
      color,
      price,
      status,
      brand,
      categoryId,
      couponId,
    } = req.body;

    const image = req.files?.image ? req.files.image[0].filename : null;
    const subImages = req.files?.subImages || [];

    if (
      !name ||
      !categoryId ||
      !quantity ||
      !slug ||
      !price ||
      !status ||
      !brand ||
      !image
    ) {
      return res
        .status(400)
        .json({ error: "Vui lòng nhập đầy đủ thông tin và ảnh." });
    }

    let sizeStr = Array.isArray(size) ? size.join(",") : String(size);
    let colorStr = Array.isArray(color) ? color.join(",") : String(color);

    try {
      const [result] = await db.query(
        `INSERT INTO sanpham (name, slug, image, description, quantity, size, color, price, status, brand, categoryId, coupon_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          slug,
          image,
          description,
          quantity,
          sizeStr,
          colorStr,
          price,
          status,
          brand,
          categoryId,
          couponId,
        ]
      );

      if (subImages.length > 0) {
        const values = subImages.map((f) => [result.insertId, f.filename]);
        await db.query(
          "INSERT INTO product_images (product_id, image_path) VALUES ?",
          [values]
        );
      }

      res.status(201).json({
        message: "✅ Thêm sản phẩm thành công!",
        product_id: result.insertId,
        image: image,
      });
    } catch (err) {
      console.error("❌ Lỗi khi thêm sản phẩm:", err);
      res
        .status(500)
        .json({ error: "Lỗi khi thêm sản phẩm vào cơ sở dữ liệu." });
    }
  }
);

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    let whereClause = "WHERE 1=1";

    if (req.query.categoryId)
      whereClause += ` AND sanpham.categoryId = ${db.escape(
        req.query.categoryId
      )}`;
    if (req.query.status)
      whereClause += ` AND sanpham.status = ${db.escape(req.query.status)}`;
    if (req.query.seo)
      whereClause += ` AND sanpham.seo_score = ${db.escape(req.query.seo)}`;
    if (req.query.keyword)
      whereClause += ` AND (sanpham.name LIKE ${db.escape(
        "%" + req.query.keyword + "%"
      )} OR sanpham.description LIKE ${db.escape(
        "%" + req.query.keyword + "%"
      )})`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM sanpham ${whereClause}`
    );

    const [products] = await db.query(
      `
      SELECT sanpham.*, categories.name AS categoryName, coupons.code AS couponCode
      FROM sanpham
      LEFT JOIN categories ON sanpham.categoryId = categories.id
      LEFT JOIN coupons ON sanpham.coupon_id = coupons.id
      ${whereClause}
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      products,
      totalProducts: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách sản phẩm:", err);
    res.status(500).json({ error: "Lỗi khi lấy danh sách sản phẩm." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [results] = await db.query(
      `
      SELECT sanpham.*, categories.name AS categoryName, coupons.code AS couponCode
      FROM sanpham
      LEFT JOIN categories ON sanpham.categoryId = categories.id
      LEFT JOIN coupons ON sanpham.coupon_id = coupons.id
      WHERE sanpham.id = ?`,
      [req.params.id]
    );

    if (results.length === 0)
      return res
        .status(404)
        .json({ error: "Không tìm thấy sản phẩm với ID này." });

    const product = results[0];
    const [subImages] = await db.query(
      "SELECT image_path FROM product_images WHERE product_id = ?",
      [req.params.id]
    );
    product.subImages = subImages.map((row) => row.image_path);
    res.status(200).json(product);
  } catch (err) {
    console.error("❌ Lỗi khi lấy sản phẩm theo ID:", err);
    res.status(500).json({ error: "Lỗi khi lấy dữ liệu sản phẩm." });
  }
});

router.put("/update/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const {
    name,
    slug,
    description,
    quantity,
    size,
    color,
    price,
    status,
    brand,
  } = req.body;
  const image = req.file ? req.file.filename : null;

  try {
    const [result] = await db.query(
      `
      UPDATE sanpham 
      SET name = ?, slug = ?, image = ?, description = ?, quantity = ?, size = ?, color = ?, price = ?, status = ?, brand = ? 
      WHERE id = ?`,
      [
        name,
        slug,
        image || req.body.oldImage,
        description,
        quantity,
        size,
        color,
        price,
        status,
        brand,
        id,
      ]
    );

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Không tìm thấy sản phẩm với ID này." });

    res.status(200).json({
      message: "✅ Cập nhật sản phẩm thành công!",
      updated_product_id: id,
    });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật sản phẩm:", err);
    res
      .status(500)
      .json({ error: "Lỗi khi cập nhật sản phẩm vào cơ sở dữ liệu." });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM sanpham WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ message: "❌ Không tìm thấy sản phẩm để xóa." });
    res.status(200).json({ message: `✅ Xóa sản phẩm thành công!` });
  } catch (err) {
    console.error("❌ Lỗi khi xóa sản phẩm:", err);
    res.status(500).json({ error: "Lỗi khi xóa sản phẩm." });
  }
});

module.exports = router;
