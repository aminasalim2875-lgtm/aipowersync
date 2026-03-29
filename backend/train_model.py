import numpy as np
import json
import os
import joblib
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler

current_dir = os.path.dirname(os.path.abspath(__file__))

print("Generating synthetic data...")
# --- 1. Neural Network (MLP) for Anomaly Detection (Reconstruction) ---
np.random.seed(42)
num_normal_samples = 2000

normal_synth_data = np.zeros((num_normal_samples, 4))
normal_synth_data[:, 0] = np.random.uniform(100, 2000, num_normal_samples) # total power
normal_synth_data[:, 1] = np.random.randint(1, 10, num_normal_samples)     # devices
normal_synth_data[:, 2] = np.random.uniform(1, 15, num_normal_samples)     # daily kWh
normal_synth_data[:, 3] = np.random.uniform(50, 1500, num_normal_samples)  # max device power

scaler_ae = MinMaxScaler()
normalized_ae_data = scaler_ae.fit_transform(normal_synth_data)

print("Building Autoencoder Neural Network (via Sklearn)...")
# We use MLPRegressor to predict its own input (Autoencoder architecture)
autoencoder = MLPRegressor(hidden_layer_sizes=(8, 4, 8), activation='relu', max_iter=200, random_state=42)

print("Training Autoencoder...")
autoencoder.fit(normalized_ae_data, normalized_ae_data)
joblib.dump(autoencoder, os.path.join(current_dir, 'anomaly_detector.pkl'))
joblib.dump(scaler_ae, os.path.join(current_dir, 'scaler_ae.pkl'))

# --- 2. Predictor Neural Network for Next Day Usage ---
num_seq_samples = 1500
seq_length = 5

days_kwh = np.linspace(10, 25, num_seq_samples + seq_length) + np.random.normal(0, 2, num_seq_samples + seq_length)

X_pred = []
y_pred = []
for i in range(num_seq_samples):
    X_pred.append(days_kwh[i:i+seq_length])
    y_pred.append(days_kwh[i+seq_length])

X_pred = np.array(X_pred)
y_pred = np.array(y_pred)

scaler_pred = MinMaxScaler()
X_pred_norm = scaler_pred.fit_transform(X_pred)
y_pred_norm = y_pred

print("Building Predicting Neural Network...")
predictor = MLPRegressor(hidden_layer_sizes=(16, 8), activation='relu', max_iter=300, random_state=42)

print("Training Predictor...")
predictor.fit(X_pred_norm, y_pred_norm)
joblib.dump(predictor, os.path.join(current_dir, 'usage_predictor.pkl'))
joblib.dump(scaler_pred, os.path.join(current_dir, 'scaler_pred.pkl'))

config = {
    'pred_seq_length': seq_length
}
with open(os.path.join(current_dir, 'config.json'), 'w') as f:
    json.dump(config, f)

print("Models entirely trained and saved using Scikit-Learn Neural Networks!")
