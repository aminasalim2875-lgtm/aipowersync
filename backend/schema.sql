-- SQL Schema for AI PowerSync MySQL Database

CREATE DATABASE IF NOT EXISTS aipowersync;
USE aipowersync;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Devices Table
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    power REAL NOT NULL,
    usage_time REAL NOT NULL,
    timestamp REAL NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Usage Logs Table (For tracking AI analytical results)
CREATE TABLE IF NOT EXISTS usage_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total_power REAL NOT NULL,
    num_devices INT NOT NULL,
    daily_kwh REAL NOT NULL,
    max_device_power REAL NOT NULL,
    anomaly_flag BOOLEAN DEFAULT FALSE,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Default Admin User (Password is 'admin123')
-- The hash below corresponds to 'admin123' using scrypt/pbkdf2 via Werkzeug. Note: Ensure python script explicitly handles hash checks.
-- For production, it's safer to register the admin via the /register endpoint.
