require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const { query } = require("./config");
const axios = require("axios");
const httpsProxyAgent = require("https-proxy-agent");
const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static("static"));

// Route for header.html
app.get("/header.html", (req, res) => {
  res.sendFile(path.join(__dirname, "static/header.html"));
});

// Route for cart.html
app.get("/cart.html", (req, res) => {
  res.sendFile(path.join(__dirname, "static/cart.html"));
});

// Route for login.html
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "static/login.html"));
});

// Auth endpoints
app.post("/api/auth/register", async (req, res) => {
  const { username, password, email, phone, address } = req.body;
  console.log("Registration attempt for user:", username);

  if (!username || !password) {
    console.log("Missing username or password");
    return res
      .status(400)
      .json({ error: "Имя пользователя и пароль обязательны" });
  }

  try {
    // Check if user already exists
    console.log("Checking if user exists:", username);
    const { rows: existingUsers } = await query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existingUsers.length > 0) {
      console.log("User already exists:", username);
      return res.status(400).json({ error: "Пользователь уже существует" });
    }

    // Hash password
    console.log("Hashing password for user:", username);
    let hashedPassword;
    try {
      hashedPassword = await bcrypt.hash(password, 10);
      console.log("Password hashed successfully");
    } catch (hashError) {
      console.error("Error during password hashing:", hashError);
      console.error("Error details:", {
        message: hashError.message,
        stack: hashError.stack,
        code: hashError.code,
      });
      return res
        .status(500)
        .json({ error: "Ошибка при создании пользователя" });
    }

    // Create user
    console.log("Creating new user:", username);
    try {
      const {
        rows: [newUser],
      } = await query(
        `INSERT INTO users (username, password, email, phone, address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          username,
          hashedPassword,
          email || null,
          phone || null,
          address || null,
        ]
      );

      console.log("User created successfully:", newUser.id);

      // Set cookie
      res.cookie("user_id", newUser.id, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.json({
        success: true,
        message: "Регистрация прошла успешно",
        redirect: "/",
      });
    } catch (dbError) {
      console.error("Error during user creation:", dbError);
      console.error("Error details:", {
        message: dbError.message,
        stack: dbError.stack,
        code: dbError.code,
      });
      return res
        .status(500)
        .json({ error: "Ошибка при создании пользователя" });
    }
  } catch (err) {
    console.error("Registration error:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
    return res.status(500).json({ error: "Ошибка базы данных" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Имя пользователя и пароль обязательны" });
  }

  try {
    // Get user
    const {
      rows: [user],
    } = await query("SELECT id, password FROM users WHERE username = $1", [
      username,
    ]);

    if (!user) {
      return res
        .status(401)
        .json({ error: "Неверное имя пользователя или пароль" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res
        .status(401)
        .json({ error: "Неверное имя пользователя или пароль" });
    }

    // Set cookie
    res.cookie("user_id", user.id, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ message: "Вход в систему прошел успешно" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("user_id", {
    httpOnly: true,
    path: "/",
  });
  res.send('<a href="/login.html">Войти</a>');
});

app.get("/api/auth/me", async (req, res) => {
  const userid = req.cookies.user_id;
  if (userid) {
    try {
      const {
        rows: [user],
      } = await query("SELECT username FROM users WHERE id = $1", [userid]);

      if (user) {
        res.json({ username: user.username });
        return;
      }
      res.status(401).json({ error: "Not authorized" });
    } catch (err) {
      console.error(err);
      res.status(401).json({ error: "Not authorized" });
    }
  } else {
    res.status(401).json({ error: "Not authorized" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "static/index.html"));
});

// Get products list
app.get("/api/products", async (req, res) => {
  try {
    // First get categories ordered by displayorder
    const { rows: categories } = await query(
      "SELECT * FROM categories ORDER BY displayorder"
    );

    // Then get all products
    const { rows: products } = await query("SELECT * FROM products");

    let html = "";

    // Generate HTML for each category
    for (const category of categories) {
      // Filter products for this category
      const categoryProducts = products.filter(
        (p) => p.categoryid === category.id
      );

      if (categoryProducts.length > 0) {
        html += `<h2 class="category-title">${category.name}</h2>`;
        html += '<div class="menu-grid">';

        for (const product of categoryProducts) {
          html += `
            <div class="menu-item ${
              !product.isactive ? "disabled" : ""
            }" data-product-id="${product.id}">
              <img src="/${product.image}" alt="${product.name}">
              <div class="menu-content">
                <h3>${product.name}</h3>
                <p>${product.description}</p>
                <div class="price-container">
                  <span class="price">${product.price} ₽</span>
                  ${
                    product.isactive
                      ? `<button class="add-to-cart" onclick="addToCartImmediately(${product.id}, event)">+</button>`
                      : `<button class="add-to-cart disabled" disabled>Нет в наличии</button>`
                  }
                </div>
              </div>
            </div>
          `;
        }

        html += "</div>";
      }
    }

    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Ошибка базы данных");
  }
});

// Add endpoint for menu item details
app.get("/api/products/:id", async (req, res) => {
  console.log("GET /api/products/:id - Request received");
  console.log("Product ID:", req.params.id);

  try {
    const {
      rows: [product],
    } = await query("SELECT * FROM products WHERE id = $1", [req.params.id]);

    if (!product) {
      console.log("Product not found");
      return res.status(404).send("Product not found");
    }

    // Формируем HTML для модального окна
    const html = `
      <div class="product-details">
        <h2>${product.name}</h2>
        <img src="/${product.image}" alt="${product.name}">
        <div class="details-section">
          <h3>Описание</h3>
          <p>${product.description || "Нет описания"}</p>
        </div>
        <div class="details-section">
          <h3>Состав</h3>
          <p>${product.composition || "Нет информации о составе"}</p>
        </div>
        <div class="details-section">
          <h3>Пищевая ценность</h3>
          <div class="nutrition-info">
            <div class="nutrition-item">
              <span>Вес</span>
              <strong>${product.weight || "0"}г</strong>
            </div>
            <div class="nutrition-item">
              <span>Калории</span>
              <strong>${product.calories || "0"}ккал</strong>
            </div>
            <div class="nutrition-item">
              <span>Белки</span>
              <strong>${product.proteins || "0"}г</strong>
            </div>
          </div>
        </div>
        <div class="customization-field">
          <label for="item-customization">Особые пожелания:</label>
          <textarea id="item-customization" placeholder="Например: без лука, добавить соус..."></textarea>
        </div>
        <div class="add-to-cart-container">
          <div class="price">${product.price || "0"} ₽</div>
          <button class="add-to-cart-btn" onclick="addToCartWithCustomization('${
            product.id
          }')">
            Добавить в корзину
          </button>
        </div>
      </div>
    `;
    res.send(html);
  } catch (error) {
    console.error("Error in /api/products/:id:", error);
    res.status(500).send("Internal server error");
  }
});

// Cart endpoints
app.get("/api/cart/items", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    // Get user's discount
    const {
      rows: [user],
    } = await query("SELECT discount FROM users WHERE id = $1", [userid]);

    const discount = user.discount || 0;

    const { rows: items } = await query(
      `SELECT c.id, p.id as product_id, p.name, p.price, p.image, c.customization
       FROM cart c
       JOIN products p ON c.productid = p.id
       WHERE c.userid = $1`,
      [userid]
    );

    // Группируем товары и считаем количество
    const groupedItems = items.reduce((acc, item) => {
      const key = `${item.product_id}-${item.customization || ""}`;
      if (!acc[key]) {
        acc[key] = {
          id: item.id,
          product: {
            id: item.product_id,
            name: item.name,
            price: item.price,
            image: item.image,
          },
          count: 1,
          cartIds: [item.id],
          discountedPrice: item.price * (1 - discount / 100),
          customization: item.customization,
        };
      } else {
        acc[key].count++;
        acc[key].cartIds.push(item.id);
      }
      return acc;
    }, {});

    // Преобразуем обратно в массив
    const result = Object.values(groupedItems);

    // Добавляем информацию о скидке
    res.json({
      items: result,
      discount: discount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/cart/add", async (req, res) => {
  const userid = req.cookies.user_id;
  console.log("Adding to cart. User ID:", userid);
  console.log("Request body:", req.body);

  if (!userid) {
    console.log("No user ID found, redirecting to login");
    return res.status(401).send(`
      <script>
        window.location.replace('/login.html');
      </script>
    `);
  }

  const { productid, customization } = req.body;
  console.log("Product ID:", productid);
  console.log("Customization:", customization);

  try {
    // Check if product exists
    const {
      rows: [product],
    } = await query("SELECT id FROM products WHERE id = $1", [productid]);

    if (!product) {
      console.log("Product not found:", productid);
      return res.status(404).json({ error: "Товар не найден" });
    }

    // Add to cart
    const { rows } = await query(
      `INSERT INTO cart (userid, productid, customization)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [parseInt(userid), parseInt(productid), customization]
    );

    console.log("Successfully added to cart:", rows[0]);
    res.sendStatus(204);
  } catch (err) {
    console.error("Cart add error:", err);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

app.delete("/api/cart/remove/:id", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).send(`
      <script>
        window.location.replace('/login.html');
      </script>
    `);
  }

  try {
    // Сначала получаем productid удаляемого товара
    const {
      rows: [cartItem],
    } = await query(
      "SELECT productid FROM cart WHERE id = $1 AND userid = $2",
      [req.params.id, userid]
    );

    if (!cartItem) {
      return res.status(404).json({ error: "Товар не найден в корзине" });
    }

    // Удаляем все записи этого товара из корзины
    await query("DELETE FROM cart WHERE userid = $1 AND productid = $2", [
      userid,
      cartItem.productid,
    ]);

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

app.post("/api/cart/clear", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    await query("DELETE FROM cart WHERE userid = $1", [userid]);
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

// Обработчик изменения количества товара в корзине
app.post("/api/cart/update/:id", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) return res.status(401).json({ error: "Not authenticated" });

  const cartId = req.params.id;
  const { change } = req.body;

  // Получаем текущий элемент корзины
  const {
    rows: [cartItem],
  } = await query("SELECT * FROM cart WHERE id = $1 AND userid = $2", [
    cartId,
    userid,
  ]);
  if (!cartItem) return res.status(404).json({ error: "Item not found" });

  if (change === 1) {
    // Добавить ещё одну такую же строку (без customization)
    await query("INSERT INTO cart (userid, productid) VALUES ($1, $2)", [
      userid,
      cartItem.productid,
    ]);
  } else if (change === -1) {
    // Удалить одну строку
    await query("DELETE FROM cart WHERE id = $1 AND userid = $2", [
      cartId,
      userid,
    ]);
  }
  res.json({ success: true });
});

// Checkout endpoint
app.post("/api/cart/checkout", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    console.log("Checkout request body:", req.body);

    // Get cart items
    const { rows: items } = await query(
      `SELECT c.id, p.id as product_id, p.name, p.price, c.customization
       FROM cart c
       JOIN products p ON c.productid = p.id
       WHERE c.userid = $1`,
      [userid]
    );

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    // Получаем информацию о пользователе
    const {
      rows: [user],
    } = await query(
      "SELECT username, phone, address, discount FROM users WHERE id = $1",
      [userid]
    );

    const currentDiscount = user.discount || 0;
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const finalAmount = Math.round(total * (1 - currentDiscount / 100));

    // Рассчитываем новую скидку (0.01% от суммы заказа)
    const discountIncrease = total * 0.0001;
    const newDiscount = Math.min(currentDiscount + discountIncrease, 20);

    // Обновляем скидку пользователя
    await query("UPDATE users SET discount = $1 WHERE id = $2", [
      newDiscount,
      userid,
    ]);

    // Create order with customization
    const {
      rows: [order],
    } = await query(
      `INSERT INTO orders (userid, totalamount, deliveryaddress, comments, customization)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        parseInt(userid),
        finalAmount,
        req.body["delivery-address"] || null,
        req.body.comments || null,
        req.body.customization || null,
      ]
    );

    // Add order items
    const orderItems = items.map((item) => ({
      orderid: order.id,
      productid: item.product_id,
      price: item.price,
      customization: item.customization,
    }));

    for (const item of orderItems) {
      await query(
        `INSERT INTO order_items (orderid, productid, price, customization)
         VALUES ($1, $2, $3, $4)`,
        [item.orderid, item.productid, item.price, item.customization]
      );
    }

    // После успешного создания заказа отправляем уведомление в Telegram
    const orderData = {
      order_id: order.id,
      customer_name: user.username,
      phone: user.phone || "Не указан",
      address: req.body["delivery-address"] || "Не указан",
      total: total.toFixed(2),
      discount: Number(currentDiscount).toFixed(2),
      final_total: finalAmount.toFixed(2),
      comments: req.body.comments || null,
      customization: req.body.customization || null,
      items: items.map((item) => ({
        name: item.name,
        quantity: 1,
        price: item.price,
        customization: item.customization,
      })),
      order_time: new Date().toLocaleString("ru-RU"),
    };

    const message = formatOrderMessage(orderData);
    await sendToTelegram(message);

    // Clear cart only after successful order creation
    await query("DELETE FROM cart WHERE userid = $1", [userid]);

    res.json({ success: true, message: "Заказ успешно создан" });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Ошибка при оформлении заказа" });
  }
});

// Orders endpoint
app.get("/api/orders", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    // Получаем все заказы пользователя с информацией о товарах
    const { rows: orders } = await query(
      `SELECT o.*, 
              COALESCE(
                json_agg(
                  CASE 
                    WHEN oi.id IS NOT NULL THEN
                      json_build_object(
                        'id', oi.id,
                        'productid', oi.productid,
                        'price', oi.price,
                        'customization', o.customization,
                        'product', json_build_object(
                          'name', p.name,
                          'image', p.image
                        )
                      )
                    ELSE NULL
                  END
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
              ) as order_items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.orderid
       LEFT JOIN products p ON oi.productid = p.id
       WHERE o.userid = $1
       GROUP BY o.id
       ORDER BY o.orderdate DESC`,
      [userid]
    );

    // Формируем HTML для отображения заказов
    let html = "";

    if (orders && orders.length > 0) {
      html +=
        '<div class="orders-container" style="max-width: 800px; margin: 0 auto; padding: 20px;">';

      // Фильтруем заказы, убирая пустые
      const validOrders = orders.filter(
        (order) =>
          order.order_items &&
          order.order_items.length > 0 &&
          order.order_items[0] !== null
      );

      if (validOrders.length === 0) {
        html = `
          <div class="empty-orders">
            <p>У вас пока нет заказов</p>
          </div>
        `;
      } else {
        validOrders.forEach((order) => {
          // Рассчитываем суммы
          const subtotal = order.order_items.reduce(
            (sum, item) => sum + (item.price || 0),
            0
          );
          const discount = order.totalamount
            ? Number(((subtotal - order.totalamount) / subtotal) * 100).toFixed(
                2
              )
            : 0;
          const discountAmount = order.totalamount
            ? (subtotal - order.totalamount).toFixed(2)
            : 0;

          html += `
            <div class="order-card">
              <div class="order-header">
                <h3>Заказ #${order.id}</h3>
                <div class="order-info">
                  <span class="order-date">${new Date(
                    order.orderdate
                  ).toLocaleDateString("ru-RU")}</span>
                </div>
              </div>
              <div class="order-details">
                ${
                  order.deliveryaddress
                    ? `<p><strong>Адрес доставки:</strong> ${order.deliveryaddress}</p>`
                    : ""
                }
                ${
                  order.comments
                    ? `<p><strong>Комментарий:</strong> ${order.comments}</p>`
                    : ""
                }
                ${
                  order.customization
                    ? `<p><strong>Особые пожелания:</strong> ${order.customization}</p>`
                    : ""
                }
              </div>
              <div class="order-items">
          `;

          // Сортируем товары по названию
          const sortedItems = order.order_items.sort((a, b) =>
            a.product.name.localeCompare(b.product.name)
          );

          sortedItems.forEach((item) => {
            html += `
              <div class="order-item">
                <img src="${item.product.image}" alt="${item.product.name}" />
                <div class="item-details">
                  <h4>${item.product.name}</h4>
                  <div class="item-info">
                    <span class="item-price">${(item.price || 0).toFixed(
                      2
                    )}₽</span>
                    <span class="item-quantity">x1</span>
                  </div>
                  <span class="item-total">Итого: ${(item.price || 0).toFixed(
                    2
                  )}₽</span>
                  ${
                    item.customization
                      ? `<p class="customization">Особые пожелания: ${item.customization}</p>`
                      : ""
                  }
                </div>
              </div>
            `;
          });

          html += `
              </div>
              <div class="order-total">
                <div class="price-row">
                  <span>Сумма заказа:</span>
                  <span>${subtotal.toFixed(2)}₽</span>
                </div>
                ${
                  discount > 0
                    ? `
                  <div class="price-row discount">
                    <span>Скидка (${discount}%):</span>
                    <span>-${discountAmount}₽</span>
                  </div>
                `
                    : ""
                }
                <div class="price-row final">
                  <span>Итого к оплате:</span>
                  <span>${(order.totalamount || subtotal).toFixed(2)}₽</span>
                </div>
              </div>
            </div>
          `;
        });
        html += "</div>";
      }
    } else {
      html = `
        <div class="empty-orders">
          <p>У вас пока нет заказов</p>
        </div>
      `;
    }

    res.send(html);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).send(`
      <div class="error-message">
        Произошла ошибка при загрузке заказов
      </div>
    `);
  }
});

// Cart size endpoint
app.get("/api/cart/size", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.send("(0)");
  }

  try {
    const { rows } = await query(
      "SELECT COUNT(*) as count FROM cart WHERE userid = $1",
      [userid]
    );

    const size = rows[0].count;
    res.send(`(${size})`);
  } catch (err) {
    console.error(err);
    res.send("(0)");
  }
});

// User discount endpoint
app.get("/api/user/discount", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    const {
      rows: [user],
    } = await query("SELECT discount FROM users WHERE id = $1", [userid]);

    const discount = user.discount || 0;
    const maxDiscount = 20;
    const progress = (discount / maxDiscount) * 100;

    const html = `
      <div class="discount-info">
        <div class="discount-value">${discount.toFixed(1)}%</div>
        <div class="discount-progress">
          <div class="discount-progress-bar" style="width: ${progress}%"></div>
        </div>
        <div class="discount-description">
          Ваша персональная скидка. Максимальная скидка: ${maxDiscount}%
        </div>
      </div>
    `;

    res.send(html);
  } catch (err) {
    console.error("Error fetching user discount:", err);
    res.status(500).send(`
      <div class="error-message">
        Произошла ошибка при загрузке информации о скидке
      </div>
    `);
  }
});

// Настройки Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROUP_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

function formatOrderMessage(orderData) {
  let message = "🛒 <b>НОВЫЙ ЗАКАЗ!</b>\n\n";
  message += `📋 <b>Номер:</b> #${orderData.order_id}\n`;
  message += `👤 <b>Клиент:</b> ${orderData.customer_name}\n`;
  message += `📞 <b>Телефон:</b> <code>${orderData.phone}</code>\n`;
  message += `🏠 <b>Адрес:</b> ${orderData.address}\n`;
  message += `💵 <b>Сумма заказа:</b> ${orderData.total} руб.\n`;
  if (orderData.discount > 0) {
    message += `💰 <b>Скидка клиента:</b> ${Number(orderData.discount).toFixed(
      2
    )}%\n`;
    message += `💵 <b>Итоговая сумма со скидкой:</b> ${orderData.final_total} руб.\n`;
  }
  if (orderData.comments) {
    message += `📝 <b>Комментарий:</b> ${orderData.comments}\n`;
  }
  if (orderData.customization) {
    message += `⚙️ <b>Особые пожелания:</b> ${orderData.customization.slice(
      0,
      7
    )}\n`;
  }
  message += "\n📦 <b>Состав заказа:</b>\n";

  // Группируем товары по названию
  const groupedItems = {};
  orderData.items.forEach((item) => {
    if (!groupedItems[item.name]) {
      groupedItems[item.name] = {
        name: item.name,
        quantity: 1,
        price: item.price,
        customization: item.customization,
      };
    } else {
      groupedItems[item.name].quantity++;
    }
  });

  // Выводим сгруппированные товары
  Object.values(groupedItems).forEach((item) => {
    message += `├ ${item.name}\n`;
    message += `├─ Количество: ${item.quantity}\n`;
    message += `├─ Цена: ${item.price} руб.\n`;
    if (item.customization) {
      message += `├─ Особые пожелания: ${item.customization}\n`;
    }
    message += `└─ Итого: ${(item.price * item.quantity).toFixed(2)} руб.\n\n`;
  });

  message += `⏱ <b>Время заказа:</b> ${orderData.order_time}\n\n`;
  message += "@yyoloq";

  return message;
}

async function sendToTelegram(message) {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  // Настройка прокси (если есть)
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const httpsAgent = proxyUrl ? new httpsProxyAgent(proxyUrl) : undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to send message to Telegram`);

      const response = await axios({
        method: "POST",
        url: TELEGRAM_API_URL,
        data: {
          chat_id: GROUP_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          disable_notification: false,
        },
        httpsAgent,
        timeout: 10000, // 10 second timeout
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("Telegram API response:", response.data);
      return response.data;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        console.error("All attempts to send message to Telegram failed");
        return null;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  return null;
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.listen(PORT, HOST, () => {
  console.log(`Сервер запущен на http://${HOST}:${PORT}`);
});
