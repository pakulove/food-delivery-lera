require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const supabase = require("./config");
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

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Имя пользователя и пароль обязательны" });
  }

  try {
    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (existingUser) {
      return res.status(400).json({ error: "Пользователь уже существует" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert([
        {
          username,
          password: hashedPassword,
          email: email || null,
          phone: phone || null,
          address: address || null,
        },
      ])
      .select()
      .single();

    if (createError) throw createError;

    // Set cookie
    res.cookie("user_id", newUser.id, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ message: "Регистрация прошла успешно" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка базы данных" });
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
    const { data: user, error } = await supabase
      .from("users")
      .select("id, password")
      .eq("username", username)
      .single();

    if (error) throw error;

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

app.get("/api/auth/me", (req, res) => {
  const userid = req.cookies.user_id;
  if (userid) {
    supabase
      .from("users")
      .select("username")
      .eq("id", userid)
      .single()
      .then(({ data: user, error }) => {
        if (error) throw error;
        if (user) {
          res.json({ username: user.username });
          return;
        }
        res.status(401).json({ error: "Not authorized" });
      })
      .catch((err) => {
        console.error(err);
        res.status(401).json({ error: "Not authorized" });
      });
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
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("*")
      .order("displayorder");

    if (categoriesError) throw categoriesError;
    console.log("Categories:", categories);

    // Then get all products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*");

    if (productsError) throw productsError;
    console.log("Products:", products);

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

    console.log("Generated HTML length:", html.length);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Ошибка базы данных");
  }
});

// Helper function to get emoji for category
function getCategoryEmoji(category) {
  if (!category) return "🍽️";

  const emojiMap = {
    Пицца: "🍕",
    Суши: "🍣",
    Бургеры: "🍔",
    Салаты: "🥗",
    Напитки: "🥤",
    Десерты: "🍰",
    pizza: "🍕",
    sushi: "🍣",
    burgers: "🍔",
    salads: "🥗",
    drinks: "🥤",
    desserts: "🍰",
  };

  // Try both exact match and lowercase match
  return emojiMap[category] || emojiMap[category.toLowerCase()] || "🍽️";
}

// Add endpoint for menu item details
app.get("/api/products/:id", async (req, res) => {
  console.log("GET /api/products/:id - Request received");
  console.log("Product ID:", req.params.id);

  try {
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", req.params.id)
      .single();

    console.log("Raw Supabase response:", { product, error });

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    if (!product) {
      console.log("Product not found");
      return res.status(404).send("Product not found");
    }

    console.log("Product data:", product);

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
    console.log("Generated HTML:", html);
    res.send(html);
  } catch (error) {
    console.error("Error in /api/products/:id:", error);
    res.status(500).send("Internal server error");
  }
});

// Добавим новый эндпоинт для получения категорий
app.get("/api/categories", async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("category");

    console.log("Supabase response:", { products, error });

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    // Получаем уникальные категории и сортируем их
    const categories = [...new Set(products.map((p) => p.category))]
      .filter(Boolean)
      .sort();
    console.log("Extracted categories:", categories);

    // Генерируем HTML для select
    const options = categories
      .map((category) => `<option value="${category}">${category}</option>`)
      .join("");

    console.log("Generated HTML:", options);
    res.send(options);
  } catch (error) {
    console.error("Error in /api/categories:", error);
    res.status(500).send("Error fetching categories");
  }
});

// Обновим эндпоинт получения цен для поддержки фильтрации
app.get("/api/prices", async (req, res) => {
  const { category } = req.query;

  try {
    let query = supabase.from("products").select("*");

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data: products, error } = await query;

    if (error) throw error;

    // Генерируем HTML для списка продуктов
    let productsHtml = "";
    products.forEach((product) => {
      productsHtml += `
        <div class="price-item">
          <img src="${product.image}" alt="${product.name}" />
          <h2>${product.name}</h2>
          <p>Цена: ${product.price} ₽/день</p>
          <div class="price-info">
            <p>⚙️ Характеристики:</p>
            <ul>
              ${product.characteristic
                .split(", ")
                .map((char) => `<li>${char}</li>`)
                .join("")}
            </ul>
          </div>
          <button
            hx-post="/api/cart/add"
            hx-vals='{"productid": ${product.id}}'
            hx-swap="none"
            hx-trigger="click"
            hx-on::after-request="document.body.dispatchEvent(new Event('cart-updated'))"
          >
            Добавить в корзину
          </button>
        </div>
      `;
    });

    res.send(productsHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Ошибка базы данных");
  }
});

// Cart API endpoints
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
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("discount")
      .eq("id", userid)
      .single();

    if (userError) throw userError;

    const discount = user.discount || 0;

    const { data: items, error } = await supabase
      .from("cart")
      .select(
        `
        id,
        product:productid (
          id,
          name,
          price,
          image
        )
      `
      )
      .eq("userid", userid);

    if (error) throw error;

    // Группируем товары и считаем количество
    const groupedItems = items.reduce((acc, item) => {
      const key = item.product.id;
      if (!acc[key]) {
        acc[key] = {
          id: item.id,
          product: item.product,
          count: 1,
          cartIds: [item.id],
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
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productid)
      .single();

    console.log("Product check result:", product);
    console.log("Product check error:", productError);

    if (productError) {
      console.error("Product check error:", productError);
      throw productError;
    }

    if (!product) {
      console.log("Product not found:", productid);
      return res.status(404).json({ error: "Товар не найден" });
    }

    // Add to cart
    const { data: cartItem, error: insertError } = await supabase
      .from("cart")
      .insert([
        {
          userid: parseInt(userid),
          productid: parseInt(productid),
        },
      ])
      .select()
      .single();

    console.log("Cart insert result:", cartItem);
    console.log("Cart insert error:", insertError);

    if (insertError) {
      console.error("Cart insert error:", insertError);
      throw insertError;
    }

    // If there's customization, create an order to store it
    if (customization) {
      console.log("Saving customization:", customization);
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            userid: parseInt(userid),
            totalamount: 0,
            orderdate: new Date().toISOString(),
            customization: customization,
          },
        ])
        .select()
        .single();

      if (orderError) {
        console.error("Error saving customization:", orderError);
        throw orderError;
      }
      console.log("Saved customization in order:", order);
    }

    console.log("Successfully added to cart:", cartItem);
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
    const { data: cartItem, error: getError } = await supabase
      .from("cart")
      .select("productid")
      .eq("id", req.params.id)
      .eq("userid", userid)
      .single();

    if (getError) throw getError;

    // Удаляем все записи этого товара из корзины
    const { error } = await supabase
      .from("cart")
      .delete()
      .eq("userid", userid)
      .eq("productid", cartItem.productid);

    if (error) throw error;

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
    const { error } = await supabase.from("cart").delete().eq("userid", userid);

    if (error) throw error;

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка базы данных" });
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
  message += `💵 <b>Сумма:</b> ${orderData.total} руб.\n`;
  if (orderData.comments) {
    message += `📝 <b>Комментарий:</b> ${orderData.comments}\n`;
  }
  message += "\n📦 <b>Состав заказа:</b>\n";

  orderData.items.forEach((item) => {
    message += `├ ${item.name}\n`;
    message += `├─ Количество: ${item.quantity}\n`;
    message += `└─ Цена: ${item.price} руб.\n\n`;
  });

  message += `⏱ <b>Время заказа:</b> ${orderData.order_time}\n\n`;
  message += "@yyoloq @manager";

  return message;
}

async function sendToTelegram(message) {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to send message to Telegram`);

      const response = await fetch(TELEGRAM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: GROUP_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          disable_notification: false,
        }),
        timeout: 10000, // 10 second timeout
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Telegram API error: ${errorData.description || response.statusText}`
        );
      }

      const result = await response.json();
      console.log("Telegram API response:", result);
      return result;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);

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
    const { data: items, error: itemsError } = await supabase
      .from("cart")
      .select(
        `
        id,
        product:productid (
          id,
          name,
          price
        )
      `
      )
      .eq("userid", userid);

    if (itemsError) {
      console.error("Error fetching cart items:", itemsError);
      throw itemsError;
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    // Получаем информацию о пользователе
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("username, phone, address, discount")
      .eq("id", userid)
      .single();

    if (userError) throw userError;

    const currentDiscount = user.discount || 0;
    const total = items.reduce((sum, item) => sum + item.product.price, 0);

    // Рассчитываем новую скидку (0.01% от суммы заказа)
    const discountIncrease = total * 0.0001;
    const newDiscount = Math.min(currentDiscount + discountIncrease, 20);

    // Обновляем скидку пользователя
    const { error: updateError } = await supabase
      .from("users")
      .update({ discount: newDiscount })
      .eq("id", userid);

    if (updateError) throw updateError;

    // Create order with customization from current request
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          userid: parseInt(userid),
          totalamount: total,
          orderdate: new Date().toISOString(),
          deliveryaddress: req.body["delivery-address"] || null,
          comments: req.body.comments || null,
          customization: req.body.customization || null, // Используем кастомизацию из текущего запроса
        },
      ])
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw orderError;
    }

    console.log("Created order:", order);

    // Add order items
    const orderItems = items.map((item) => ({
      orderid: order.id,
      productid: item.product.id,
      price: item.product.price,
    }));

    const { error: itemsInsertError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsInsertError) {
      console.error("Error adding order items:", itemsInsertError);
      throw itemsInsertError;
    }

    // После успешного создания заказа отправляем уведомление в Telegram
    const orderData = {
      order_id: order.id,
      customer_name: user.username,
      phone: user.phone || "Не указан",
      address: req.body["delivery-address"] || "Не указан",
      total: total.toFixed(2),
      comments: req.body.comments || null,
      items: items.map((item) => ({
        name: item.product.name,
        quantity: 1,
        price: item.product.price,
      })),
      order_time: new Date().toLocaleString("ru-RU"),
    };

    const message = formatOrderMessage(orderData);
    await sendToTelegram(message);

    // Clear cart only after successful order creation
    const { error: clearError } = await supabase
      .from("cart")
      .delete()
      .eq("userid", userid);

    if (clearError) {
      console.error("Error clearing cart:", clearError);
      console.error("Cart was not cleared, but order was created");
    }

    res.json({ success: true, message: "Заказ успешно создан" });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Ошибка при оформлении заказа" });
  }
});

app.post("/api/cart/save-dates", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }
});

app.post("/api/cart/update/:id", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    const { change } = req.body;
    const cartItemId = req.params.id;

    // Получаем информацию о товаре
    const { data: cartItem, error: getError } = await supabase
      .from("cart")
      .select("productid")
      .eq("id", cartItemId)
      .eq("userid", userid)
      .single();

    if (getError) throw getError;

    // Получаем все записи этого товара в корзине
    const { data: allItems, error: countError } = await supabase
      .from("cart")
      .select("id")
      .eq("userid", userid)
      .eq("productid", cartItem.productid);

    if (countError) throw countError;

    const currentCount = allItems.length;

    if (change < 0 && currentCount <= 1) {
      // Если пытаемся уменьшить и у нас только 1 товар - удаляем
      const { error: deleteError } = await supabase
        .from("cart")
        .delete()
        .eq("id", cartItemId)
        .eq("userid", userid);

      if (deleteError) throw deleteError;
    } else if (change > 0) {
      // Если увеличиваем - добавляем новую запись
      const { error: insertError } = await supabase.from("cart").insert([
        {
          userid: parseInt(userid),
          productid: cartItem.productid,
        },
      ]);

      if (insertError) throw insertError;
    } else if (change < 0) {
      // Если уменьшаем - удаляем одну запись
      const { error: deleteError } = await supabase
        .from("cart")
        .delete()
        .eq("id", cartItemId)
        .eq("userid", userid);

      if (deleteError) throw deleteError;
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

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
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(
        `
        id,
        orderdate,
        totalamount,
        customization,
        comments,
        deliveryaddress,
        order_items (
          productid,
          price,
          product:productid (
            name,
            image
          )
        )
      `
      )
      .eq("userid", userid)
      .order("orderdate", { ascending: false });

    if (ordersError) throw ordersError;

    console.log("Orders data:", JSON.stringify(orders, null, 2));

    // Формируем HTML для отображения заказов
    let html = "";

    if (orders && orders.length > 0) {
      html +=
        '<div class="orders-container" style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      orders.forEach((order) => {
        console.log(
          "Processing order:",
          order.id,
          "Customization:",
          order.customization
        );

        // Группируем одинаковые товары
        const groupedItems = order.order_items.reduce((acc, item) => {
          const key = item.productid;
          if (!acc[key]) {
            acc[key] = {
              product: item.product,
              price: item.price,
              quantity: 1,
            };
          } else {
            acc[key].quantity++;
          }
          return acc;
        }, {});

        // Рассчитываем сумму без скидки
        const subtotal = order.order_items.reduce(
          (sum, item) => sum + item.price,
          0
        );
        const discount = (
          ((subtotal - order.totalamount) / subtotal) *
          100
        ).toFixed(1);
        const discountAmount = (subtotal - order.totalamount).toFixed(2);

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
                  ? `<div class="customization"><p><strong>Особые пожелания:</strong> ${order.customization}</p></div>`
                  : ""
              }
            </div>
            <div class="order-items">
        `;

        Object.values(groupedItems).forEach((item) => {
          html += `
            <div class="order-item">
              <img src="${item.product.image}" alt="${item.product.name}" />
              <div class="item-details">
                <h4>${item.product.name}</h4>
                <div class="item-info">
                  <span class="item-price">${item.price}₽</span>
                  <span class="item-quantity">x${item.quantity}</span>
                </div>
                <span class="item-total">Итого: ${
                  item.price * item.quantity
                }₽</span>
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
                  <span>Ваша скидка (${discount}%):</span>
                  <span>-${discountAmount}₽</span>
                </div>
              `
                  : ""
              }
              <div class="price-row total">
                <span>Итого к оплате:</span>
                <span>${order.totalamount.toFixed(2)}₽</span>
              </div>
            </div>
          </div>
        `;
      });
      html += "</div>";
    } else {
      html = `
        <div class="empty-orders">
          <p>У вас пока нет заказов</p>
        </div>
      `;
    }

    console.log("Generated HTML:", html);
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

// Add endpoint for cart size
app.get("/api/cart/size", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.send("(0)");
  }

  try {
    const { data: items, error } = await supabase
      .from("cart")
      .select("id")
      .eq("userid", userid);

    if (error) throw error;

    const size = items ? items.length : 0;
    res.send(`(${size})`);
  } catch (err) {
    console.error(err);
    res.send("(0)");
  }
});

// Добавляем эндпоинт для получения скидки пользователя
app.get("/api/user/discount", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("discount")
      .eq("id", userid)
      .single();

    if (error) throw error;

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

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.listen(PORT, HOST, () => {
  console.log(`Сервер запущен на http://${HOST}:${PORT}`);
});
