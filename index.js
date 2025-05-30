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
      console.log(`Category ${category.name} products:`, categoryProducts);

      if (categoryProducts.length > 0) {
        html += `<h2 class="category-title">${category.name}</h2>`;
        html += '<div class="menu-grid">';

        categoryProducts.forEach((product) => {
          html += `
            <div class="menu-item" 
                 hx-get="/api/menu/item/${product.id}" 
                 hx-target="#itemModal" 
                 hx-swap="innerHTML">
              <img src="${product.image}" alt="${product.name}" />
              <div class="menu-content">
                <h3>${product.name}</h3>
                <p>${product.description || ""}</p>
                <div class="price-container">
                  <span class="price">${product.price}₽</span>
                  <button class="add-to-cart"
                          hx-post="/api/cart/add"
                          hx-vals='{"productid": ${product.id}}'
                          hx-swap="none"
                          hx-trigger="click"
                          hx-on::after-request="document.body.dispatchEvent(new Event('cart-updated'))"
                          onclick="event.stopPropagation()">
                    +
                  </button>
                </div>
              </div>
            </div>
          `;
        });

        html += "</div>";
      }
    }

    console.log("Generated HTML length:", html.length);
    console.log("HTML preview:", html.substring(0, 200));

    res.send(html);
  } catch (err) {
    console.error("Error in /api/products:", err);
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
app.get("/api/menu/item/:id", async (req, res) => {
  try {
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) throw error;
    if (!product) {
      return res.status(404).send("Товар не найден");
    }

    const html = `
      <h2>${product.name}</h2>
      <img src="${product.image}" alt="${
      product.name
    }" style="width: 100%; max-height: 200px; object-fit: cover" />
      
      <div class="details-section">
        <h3>Состав</h3>
        <p>${product.composition || "Нет информации о составе"}</p>
        
        <div class="nutrition-info">
          <div class="nutrition-item">
            <strong>Вес:</strong>
            <span>${product.weight || "Нет информации"}</span>
          </div>
          <div class="nutrition-item">
            <strong>Калории:</strong>
            <span>${product.calories || "Нет информации"}</span>
          </div>
          <div class="nutrition-item">
            <strong>Белки:</strong>
            <span>${product.proteins || "Нет информации"}</span>
          </div>
        </div>
      </div>

      <div class="price-container" style="margin-top: 20px">
        <span class="price">${product.price}₽</span>
        <button class="add-to-cart-btn" 
                hx-post="/api/cart/add"
                hx-vals='{"productid": ${product.id}}'
                hx-swap="none"
                hx-trigger="click"
                hx-on::after-request="document.body.dispatchEvent(new Event('cart-updated'))">
          Добавить в корзину
        </button>
      </div>
    `;

    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Ошибка базы данных");
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
    return res.status(401).send(`
      <script>
        window.location.replace('/login.html');
      </script>
    `);
  }

  try {
    const { data: items, error } = await supabase
      .from("cart")
      .select(
        `
        id,
        product:productid (
          name,
          price,
          image
        )
      `
      )
      .eq("userid", userid);

    if (error) throw error;

    const total = items.reduce((sum, item) => sum + item.product.price, 0);

    let html = "";
    items.forEach((item) => {
      html += `
        <div class="cart-item">
          <img src="${item.product.image}" alt="${item.product.name}" style="width: 50px; height: 50px;">
          <span>${item.product.name}</span>
          <span>${item.product.price} ₽</span>
          <button hx-delete="/api/cart/remove/${item.id}"
                  hx-swap="none"
                  hx-trigger="click"
                  hx-on::after-request="document.body.dispatchEvent(new Event('cart-updated'))">
            ❌
          </button>
        </div>
      `;
    });

    html += `<h3 id="total-price">Итого: ${total} ₽</h3>`;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.post("/api/cart/add", async (req, res) => {
  const userid = req.cookies.user_id;
  console.log("Adding to cart. User ID:", userid);

  if (!userid) {
    return res.status(401).send(`
      <script>
        window.location.replace('/login.html');
      </script>
    `);
  }

  const { productid } = req.body;
  console.log("Product ID:", productid);

  try {
    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productid)
      .single();

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

    if (insertError) {
      console.error("Cart insert error:", insertError);
      throw insertError;
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
    const { error } = await supabase
      .from("cart")
      .delete()
      .eq("id", req.params.id)
      .eq("userid", userid);

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

app.post("/api/cart/checkout", async (req, res) => {
  const userid = req.cookies.user_id;
  if (!userid) {
    return res.status(401).json({
      error: "Not authenticated",
      redirect: "/login.html",
    });
  }

  const { payment: payment_method } = req.body;

  try {
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

    if (itemsError) throw itemsError;

    if (items.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    const total = items.reduce((sum, item) => sum + item.product.price, 0);

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          userid,
          totalamount: total,
          orderdate: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    // Add order items
    const orderItems = items.map((item) => ({
      orderid: order.id,
      productid: item.product.id,
      price: item.product.price,
    }));

    const { error: itemsInsertError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsInsertError) throw itemsInsertError;

    // Clear cart
    const { error: clearError } = await supabase
      .from("cart")
      .delete()
      .eq("userid", userid);

    if (clearError) throw clearError;

    res.json({ message: "Заказ успешно создан" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка базы данных" });
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


const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.listen(PORT, HOST, () => {
  console.log(`Сервер запущен на http://${HOST}:${PORT}`);
});
