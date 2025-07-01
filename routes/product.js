const express = require("express");
const router = express.Router();
const db = require("../db"); // Đảm bảo bạn đã kết nối đúng với MySQL
const multer = require("multer");
const path = require("path");

// Cấu hình nơi lưu ảnh
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/"); // thư mục lưu ảnh
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: storage });

// Middleware để xử lý JSON và x-www-form-urlencoded
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
// WEBSITE
router.get("/category/:slug", (req, res) => {
  const categorySlug = req.params.slug;

  // Truy vấn danh mục chính dựa trên slug
  db.query(
    "SELECT * FROM categories WHERE slug = ?",
    [categorySlug],
    (err, categoryResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server Error");
      }

      if (categoryResults.length === 0) {
        return res.status(404).send("Category not found");
      }

      // Lấy categoryTitle
      const categoryTitle = categoryResults[0].name;

      const categoryId = categoryResults[0].id;

      // Truy vấn sản phẩm dựa vào category_id
      db.query(
        `SELECT sanpham.*, coupons.discount_type AS discount_type, coupons.discount_value AS discount_value
   FROM sanpham
   LEFT JOIN coupons ON sanpham.coupon_id = coupons.id
   WHERE sanpham.categoryId = ?`,
        [categoryId],
        (err, productResults) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Server Error");
          }

          // Trả về categoryTitle và sản phẩm
          res.json({
            categoryTitle,
            products: productResults,
          });
        }
      );
    }
  );
});
router.get("/products/:slug", (req, res) => {
  const { slug } = req.params;

  const productSql = `
    SELECT 
      sanpham.*, 
      coupons.discount_type AS discount_type, 
      coupons.discount_value AS discount_value 
    FROM sanpham 
    LEFT JOIN coupons ON sanpham.coupon_id = coupons.id 
    WHERE slug = ?
  `;

  db.query(productSql, [slug], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy sản phẩm:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }

    const product = results[0];

    // Tiếp tục lấy ảnh phụ
    const subImgSql = `SELECT image_path FROM product_images WHERE product_id = ?`;

    db.query(subImgSql, [product.id], (imgErr, imgResults) => {
      if (imgErr) {
        console.error("❌ Lỗi khi lấy ảnh phụ:", imgErr);
        return res.status(500).json({ message: "Lỗi khi lấy ảnh phụ" });
      }

      product.subImages = imgResults.map((row) => row.image_path); // mảng ảnh phụ
      res.json(product);
    });
  });
});

// GET /api/products/search?keyword=giay
router.get("/search", (req, res) => {
  const keyword = req.query.keyword || "";
  const searchQuery = `
    SELECT * FROM sanpham 
    WHERE name LIKE ?
  `;

  db.query(searchQuery, [`%${keyword}%`], (err, results) => {
    if (err) {
      console.error("Lỗi khi tìm kiếm sản phẩm:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json(results);
  });
});

// QUẢN TRỊ
// Endpoint để lấy danh sách danh mục
router.get("/danhmuc", (req, res) => {
  const sql = "SELECT * FROM categories WHERE parent_id != 0"; // Giả sử bảng của bạn là 'categories'
  db.query(sql, (err, categories) => {
    if (err) {
      return res.status(500).json({ error: "Lỗi khi lấy danh mục" });
    }
    res.json({ categories });
  });
});

// Route để thêm sản phẩm mới
router.post(
  "/add",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "subImages", maxCount: 10 },
  ]),
  (req, res) => {
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

    const image =
      req.files && req.files.image ? req.files.image[0].filename : null;
    const subImages =
      req.files && req.files.subImages ? req.files.subImages : [];

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

    let sizeStr = "",
      colorStr = "";

    try {
      const parsedSize = Array.isArray(size) ? size : JSON.parse(size);
      sizeStr = Array.isArray(parsedSize) ? parsedSize.join(",") : String(size);
    } catch (err) {
      sizeStr = String(size);
    }

    try {
      const parsedColor = Array.isArray(color) ? color : JSON.parse(color);
      colorStr = Array.isArray(parsedColor)
        ? parsedColor.join(",")
        : String(color);
    } catch (err) {
      colorStr = String(color);
    }

    const sql = `
    INSERT INTO sanpham (name, slug, image, description, quantity, size, color, price, status, brand, categoryId, coupon_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    db.query(
      sql,
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
        couponId && couponId !== "" ? couponId : null,
      ],
      (err, result) => {
        if (err) {
          console.error("❌ Lỗi khi thêm sản phẩm:", err);
          return res
            .status(500)
            .json({ error: "Lỗi khi thêm sản phẩm vào cơ sở dữ liệu." });
        }

        if (subImages.length > 0) {
          const subImgSQL = `
        INSERT INTO product_images (product_id, image_path) VALUES ?
      `;
          const values = subImages.map((f) => [result.insertId, f.filename]);
          db.query(subImgSQL, [values], (err2) => {
            if (err2) {
              console.error("❌ Lỗi khi lưu ảnh phụ:", err2);
              return res.status(500).json({ error: "Lỗi khi lưu ảnh phụ." });
            }
            res.status(201).json({
              message: "✅ Thêm sản phẩm và ảnh phụ thành công!",
              product_id: result.insertId,
              image: image,
            });
          });
        } else {
          res.status(201).json({
            message: "✅ Thêm sản phẩm thành công!",
            product_id: result.insertId,
            image: image,
          });
        }
      }
    );
  }
);

// Route để lấy tất cả sản phẩm (có lọc)
router.get("/", (req, res) => {
  console.log("Nhận yêu cầu GET /api/products");

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  let whereClause = "WHERE 1 = 1";

  // Lọc theo danh mục
  if (req.query.categoryId) {
    whereClause += ` AND sanpham.categoryId = ${db.escape(
      req.query.categoryId
    )}`;
  }

  // Lọc theo trạng thái
  if (req.query.status) {
    whereClause += ` AND sanpham.status = ${db.escape(req.query.status)}`;
  }

  // Lọc theo điểm SEO
  if (req.query.seo) {
    whereClause += ` AND sanpham.seo_score = ${db.escape(req.query.seo)}`;
  }

  // Tìm kiếm theo từ khóa
  if (req.query.keyword) {
    whereClause += ` AND (sanpham.name LIKE ${db.escape(
      "%" + req.query.keyword + "%"
    )} OR sanpham.description LIKE ${db.escape(
      "%" + req.query.keyword + "%"
    )})`;
  }

  // Đếm tổng số sản phẩm
  const sqlCount = `SELECT COUNT(*) AS total FROM sanpham ${whereClause}`;

  // Lấy danh sách sản phẩm kèm theo coupon
  const sqlProducts = `
    SELECT 
      sanpham.*, 
      categories.name AS categoryName,
      coupons.code AS couponCode
    FROM 
      sanpham
    LEFT JOIN 
      categories ON sanpham.categoryId = categories.id
    LEFT JOIN
      coupons ON sanpham.coupon_id = coupons.id  -- JOIN với bảng coupons để lấy thông tin mã giảm giá
    ${whereClause}
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Thực thi truy vấn đếm số lượng sản phẩm
  db.query(sqlCount, (err, countResults) => {
    if (err) {
      console.error("❌ Lỗi khi lấy tổng số sản phẩm:", err);
      return res.status(500).json({ error: "Lỗi khi lấy tổng số sản phẩm." });
    }

    const totalProducts = countResults[0].total;
    const totalPages = Math.ceil(totalProducts / limit);

    // Thực thi truy vấn lấy sản phẩm
    db.query(sqlProducts, (err, products) => {
      if (err) {
        console.error("❌ Lỗi khi lấy danh sách sản phẩm:", err);
        return res
          .status(500)
          .json({ error: "Lỗi khi lấy danh sách sản phẩm." });
      }

      res.status(200).json({
        products,
        totalProducts,
        totalPages,
        currentPage: page,
      });
    });
  });
});

// Route để lấy sản phẩm theo ID
router.get("/:id", (req, res) => {
  console.log(`Nhận yêu cầu GET /api/products/${req.params.id}`);
  const { id } = req.params;

  const productSql = `
    SELECT 
      sanpham.*, 
      categories.name AS categoryName,
      coupons.code AS couponCode
    FROM 
      sanpham
    LEFT JOIN 
      categories ON sanpham.categoryId = categories.id
    LEFT JOIN
      coupons ON sanpham.coupon_id = coupons.id  
    WHERE sanpham.id = ?
  `;

  db.query(productSql, [id], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy sản phẩm theo ID:", err);
      return res.status(500).json({ error: "Lỗi khi lấy dữ liệu sản phẩm." });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy sản phẩm với ID này." });
    }

    const product = results[0];

    // Lấy danh sách ảnh phụ
    const subImagesSql = `SELECT image_path FROM product_images WHERE product_id = ?`;

    db.query(subImagesSql, [id], (err2, subImageResults) => {
      if (err2) {
        console.error("❌ Lỗi khi lấy ảnh phụ:", err2);
        return res.status(500).json({ error: "Lỗi khi lấy ảnh phụ." });
      }

      // Gắn danh sách ảnh phụ vào kết quả
      product.subImages = subImageResults.map((row) => row.image_path);

      res.status(200).json(product);
    });
  });
});

// Route để cập nhật sản phẩm
router.put("/update/:id", upload.single("image"), (req, res) => {
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
  let imageQuery = image ? image : "image";

  const sql = `
    UPDATE sanpham 
    SET 
      name = ?, 
      slug = ?, 
      image = ?, 
      description = ?, 
      quantity = ?, 
      size = ?, 
      color = ?, 
      price = ?, 
      status = ?, 
      brand = ? 
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      name,
      slug,
      imageQuery,
      description,
      quantity,
      size,
      color,
      price,
      status,
      brand,
      id,
    ],
    (err, result) => {
      if (err) {
        console.error("❌ Lỗi khi cập nhật sản phẩm:", err);
        return res
          .status(500)
          .json({ error: "Lỗi khi cập nhật sản phẩm vào cơ sở dữ liệu." });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ error: "Không tìm thấy sản phẩm với ID này." });
      }

      res.status(200).json({
        message: "✅ Cập nhật sản phẩm thành công!",
        updated_product_id: id,
      });
    }
  );
});

// API để xóa sản phẩm
router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM sanpham WHERE id = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ Lỗi khi xóa sản phẩm:", err);
      return res.status(500).json({ error: "Lỗi khi xóa sản phẩm." });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "❌ Không tìm thấy sản phẩm để xóa." });
    }

    res.status(200).json({ message: `✅ Xóa sản phẩm thành công!` });
  });
});

module.exports = router;
