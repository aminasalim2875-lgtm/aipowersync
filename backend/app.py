import os
import json
import joblib
import numpy as np
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import bcrypt
from functools import wraps

app_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(app_dir)

# Tell Flask to handle static routing completely autonomously via our manual custom routes
app = Flask(__name__)
app.secret_key = 'super_secret_key_for_flask_sessions'
CORS(app, supports_credentials=True)  # Enable CORS with credentials for sessions

# MySQL Configuration (To be updated later manually or via env variables)
DB_CONFIG = {
    'host': 'localhost', # Replace with AWS RDS endpoint if using AWS RDS
    'user': 'flaskuser',      # Replace with your MySQL username
    'password': 'flaskpassword123', # Replace with your MySQL password
    'database': 'aipowersync'
}

def get_db_connection():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

# Load Models
print("Loading Neural Network models...")
try:
    ae_model = joblib.load(os.path.join(app_dir, 'anomaly_detector.pkl'))
    scaler_ae = joblib.load(os.path.join(app_dir, 'scaler_ae.pkl'))
    pred_model = joblib.load(os.path.join(app_dir, 'usage_predictor.pkl'))
    scaler_pred = joblib.load(os.path.join(app_dir, 'scaler_pred.pkl'))
    with open(os.path.join(app_dir, 'config.json'), 'r') as f:
        config = json.load(f)
    seq_length = config.get('pred_seq_length', 5)
except Exception as e:
    print("WARNING: Models not found. Please run train_model.py first!")
    seq_length = 5

from flask import send_from_directory

# ==== ROUTES ====
@app.route('/')
def serve_index():
    return send_from_directory(parent_dir, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if path != "" and os.path.exists(os.path.join(parent_dir, path)):
        return send_from_directory(parent_dir, path)
    return send_from_directory(parent_dir, 'index.html')


# Middleware snippet to protect routes
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
           return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

# ==== AUTHENTICATION ENDPOINTS ====
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')

    if not username or not password:
        return jsonify({'status': 'error', 'message': 'Missing data'}), 400

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    conn = get_db_connection()
    if not conn: return jsonify({'status': 'error', 'message': 'DB connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO users (username, password, role) VALUES (%s, %s, %s)', 
                       (username, hashed_password.decode('utf-8'), role))
        conn.commit()
    except Error as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    finally:
        cursor.close()
        conn.close()
        
    return jsonify({'status': 'success', 'message': 'User registered successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    if not conn: return jsonify({'status': 'error', 'message': 'DB connection failed'}), 500
    cursor = conn.cursor(dictionary=True)
    cursor.execute('SELECT id, password, role FROM users WHERE username = %s', (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user and bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        session['user_id'] = user['id']
        session['role'] = user['role']
        return jsonify({'status': 'success', 'role': user['role']})
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('role', None)
    return jsonify({'status': 'success'})

@app.route('/api/me', methods=['GET'])
@login_required
def me():
    return jsonify({'status': 'success', 'user_id': session['user_id'], 'role': session.get('role')})

# ==== ADMIN ENDPOINTS ====
@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
    conn = get_db_connection()
    if not conn: return jsonify({'status': 'error', 'message': 'DB connection failed'}), 500
    cursor = conn.cursor(dictionary=True)
    cursor.execute('SELECT id, username, role, created_at FROM users')
    users = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(users)

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
    if user_id == 1:
        return jsonify({'status': 'error', 'message': 'Cannot delete root admin'}), 403
    conn = get_db_connection()
    if not conn: return jsonify({'status': 'error', 'message': 'DB connection failed'}), 500
    cursor = conn.cursor()
    cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'status': 'success'})

# ==== DEVICE ENDPOINTS ====
@app.route('/api/devices', methods=['GET'])
@login_required
def get_devices():
    user_id = session['user_id']
    role = session.get('role')
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Admins see all devices, Normal users only see their own
    if role == 'admin':
        cursor.execute('SELECT * FROM devices')
    else:
        cursor.execute('SELECT * FROM devices WHERE user_id = %s', (user_id,))
        
    devices = cursor.fetchall()
    
    # Map MySQL column names back to Javascript's expected variable names
    formatted_devices = []
    for d in devices:
        formatted_devices.append({
            'id': d['id'],
            'name': d['device_name'],
            'power': d['power'],
            'hours': d['usage_time'],
            'timestamp': d['timestamp']
        })
        
    cursor.close()
    conn.close()
    return jsonify(formatted_devices)

@app.route('/api/devices', methods=['POST'])
@login_required
def add_device():
    new_device = request.json
    user_id = session['user_id']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO devices (id, user_id, device_name, power, usage_time, timestamp) VALUES (%s, %s, %s, %s, %s, %s)',
                   (new_device['id'], user_id, new_device['name'], new_device['power'], new_device['hours'], new_device['timestamp']))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/devices/<device_id>', methods=['DELETE'])
@login_required
def delete_device(device_id):
    user_id = session['user_id']
    role = session.get('role')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    if role == 'admin':
        cursor.execute('DELETE FROM devices WHERE id = %s', (device_id,))
    else:
        cursor.execute('DELETE FROM devices WHERE id = %s AND user_id = %s', (device_id, user_id))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/devices', methods=['DELETE'])
@login_required
def clear_all_devices():
    user_id = session['user_id']
    role = session.get('role')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    if role == 'admin':
        cursor.execute('DELETE FROM devices')
    else:
        cursor.execute('DELETE FROM devices WHERE user_id = %s', (user_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'status': 'success'})

# ==== DATA ANALYTICS & MACHINE LEARNING ====
@app.route('/api/analyze', methods=['POST'])
@login_required
def analyze():
    data = request.json
    user_id = session['user_id']
    
    total_power = float(data.get('totalPower', 0))
    num_devices = int(data.get('numDevices', 0))
    daily_kwh = float(data.get('dailyKwh', 0))
    max_device_power = float(data.get('maxDevicePower', 0))
    kwh_history = data.get('kwhHistory', [])

    # 1. Anomaly Detection Inference
    features_norm = scaler_ae.transform([[total_power, num_devices, daily_kwh, max_device_power]])
    reconstructed = ae_model.predict(features_norm)
    mse = np.mean(np.square(features_norm - reconstructed[0]))
    
    anomaly_threshold = 0.02  # Lowered from 0.05 to increase sensitivity
    is_anomaly = bool(float(mse) > anomaly_threshold)
    
    # DEBUG: Print to AWS Terminal so we can see the scores in real-time
    print(f"--- AI INFERENCE ---")
    print(f"Inputs: {total_power}W, {num_devices} devices, {daily_kwh}kWh")
    print(f"MSE Score: {mse:.6f} | Is Anomaly: {is_anomaly}")
    
    # 2. Daily kWh Usage Prediction
    if len(kwh_history) < seq_length:
        padding = [daily_kwh] * (seq_length - len(kwh_history))
        kwh_history = padding + kwh_history
    hist_norm = scaler_pred.transform([np.array(kwh_history[-seq_length:])])
    predicted_kwh = pred_model.predict(hist_norm)[0]
    
    # 3. Store Results in MySQL usage_logs
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO usage_logs 
            (user_id, total_power, num_devices, daily_kwh, max_device_power, anomaly_flag) 
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', (user_id, total_power, num_devices, daily_kwh, max_device_power, is_anomaly))
        conn.commit()
        cursor.close()
        conn.close()
    
    return jsonify({
        'status': 'success',
        'isAnomaly': is_anomaly,
        'anomalyScore': float(mse),
        'predictedNextDayKwh': round(float(predicted_kwh), 2)
    })

if __name__ == '__main__':
    # Start the server on public IP so AWS deployments can map the domain globally
    # Note: Changed to Port 8000 because macOS Airplay explicitly blocks Port 5000 locally
    app.run(host='0.0.0.0', debug=True, port=8000)
