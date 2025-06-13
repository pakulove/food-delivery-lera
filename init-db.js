const fs = require("fs");
const path = require("path");
const { pool } = require("./config");

async function initDatabase() {
  try {
    // Read schema and init files
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    const init = fs.readFileSync(path.join(__dirname, "init.sql"), "utf8");

    // Execute schema
    console.log("Creating database schema...");
    await pool.query(schema);
    console.log("Schema created successfully");

    // Execute init data
    console.log("Initializing database with sample data...");
    await pool.query(init);
    console.log("Sample data inserted successfully");

    console.log("Database initialization completed successfully");
  } catch (err) {
    console.error("Error initializing database:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
