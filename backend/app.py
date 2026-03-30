from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import json
import os
import sqlite3
import joblib

app_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(app_dir)

# Tell Flask to serve static frontend files from the parent directory
app = Flask(__name__, static_folder=parent_dir, static_url_path='')
CORS(app)  # Enable CORS

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def serve_static(path):
    return app.send_static_file(path)

# Database Setup
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'devices.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT,
            power REAL,
            hours REAL,
            timestamp REAL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

print("Loading Neural Network models...")
current_dir = os.path.dirname(os.path.abspath(__file__))
ae_model = joblib.load(os.path.join(current_dir, 'anomaly_detector.pkl'))
scaler_ae = joblib.load(os.path.join(current_dir, 'scaler_ae.pkl'))

pred_model = joblib.load(os.path.join(current_dir, 'usage_predictor.pkl'))
scaler_pred = joblib.load(os.path.join(current_dir, 'scaler_pred.pkl'))

with open(os.path.join(current_dir, 'config.json'), 'r') as f:
    config = json.load(f)

seq_length = config['pred_seq_length']

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    total_power = data.get('totalPower', 0)
    num_devices = data.get('numDevices', 0)
    daily_kwh = data.get('dailyKwh', 0)
    max_device_power = data.get('maxDevicePower', 0)
    
    kwh_history = data.get('kwhHistory', [])

    # 1. Evaluate Anomaly using Autoencoder Neural Network
    features = np.array([[total_power, num_devices, daily_kwh, max_device_power]])
    features_norm = scaler_ae.transform(features)
    
    reconstructed = ae_model.predict(features_norm)
    
    # Calculate Mean Squared Error
    mse = np.mean(np.square(features_norm - reconstructed[0]))
    
    anomaly_threshold = 0.05
    is_anomaly = float(mse) > anomaly_threshold
    
    # 2. Predict Future Usage 
    if len(kwh_history) < seq_length:
        padding = [daily_kwh] * (seq_length - len(kwh_history))
        kwh_history = padding + kwh_history
        
    hist_input = np.array(kwh_history[-seq_length:])
    hist_norm = scaler_pred.transform([hist_input])
    
    predicted_kwh = pred_model.predict(hist_norm)[0]
    
    return jsonify({
        'status': 'success',
        'isAnomaly': is_anomaly,
        'anomalyScore': float(mse),
        'predictedNextDayKwh': round(predicted_kwh, 2)
    })

# --- Database Endpoints ---
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/devices', methods=['GET'])
def get_devices():
    conn = get_db_connection()
    devices = conn.execute('SELECT * FROM devices').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in devices])

@app.route('/api/devices', methods=['POST'])
def add_device():
    new_device = request.json
    conn = get_db_connection()
    conn.execute('INSERT INTO devices (id, name, power, hours, timestamp) VALUES (?, ?, ?, ?, ?)',
                 (new_device['id'], new_device['name'], new_device['power'], new_device['hours'], new_device['timestamp']))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/devices/<device_id>', methods=['DELETE'])
def delete_device(device_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM devices WHERE id = ?', (device_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/devices', methods=['DELETE'])
def clear_all_devices():
    conn = get_db_connection()
    conn.execute('DELETE FROM devices')
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    # Start the server on port 5000 and bind to all IPs (0.0.0.0 means public AWS connection)
    app.run(host='0.0.0.0', debug=True, port=5000)
