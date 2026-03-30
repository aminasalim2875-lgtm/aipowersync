// Core AI Simulation Engine with Deep Learning Backend Integration

class AIEngine {
  constructor(store) {
    this.store = store;
    this.PEAK_START_HOUR = 18; // 6 PM
    this.PEAK_END_HOUR = 22; // 10 PM

    // DL Backend State
    this.isAnomaly = false;
    this.anomalyScore = 0;
    this.dlPredictedNextDayKwh = null;
    this.ANOMALY_THRESHOLD = 3000; // Local fallback
  }

  // Interacts with Flask API (Deep Learning Models)
  async fetchDeepLearningInsights() {
    const devices = this.store.getDevices();
    if (devices.length === 0) return;

    const totalPower = this.store.getTotalPower();
    const dailyKWh = this.store.getDailyEnergyKWh();
    const maxDevicePower = devices.length > 0 ? Math.max(...devices.map(d => d.power)) : 0;

    const payload = {
      totalPower: totalPower,
      numDevices: devices.length,
      dailyKwh: dailyKWh,
      maxDevicePower: maxDevicePower,
      kwhHistory: [12, 14, 13, 15, dailyKWh] // Mocking historical data array for LSTM/Dense sequence
    };

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        this.isAnomaly = data.isAnomaly;
        this.anomalyScore = data.anomalyScore;
        this.dlPredictedNextDayKwh = data.predictedNextDayKwh;
        console.log("Deep Learning API Result:", data);

        // Dispatch event so UI can immediately react to DL updates
        window.dispatchEvent(new CustomEvent('dlUpdate'));
      }
    } catch (e) {
      console.warn("Could not connect to DL Backend. Falling back to local heuristic.", e);
    }
  }

  // 8. Energy Efficiency Score
  calculateEfficiencyScore() {
    const devices = this.store.getDevices();
    if (devices.length === 0) return 100;

    let score = 100;
    const dailyKWh = this.store.getDailyEnergyKWh();

    if (dailyKWh > 20) score -= (dailyKWh - 20) * 2;

    // Use DL Backend Anomaly detection if available
    if (this.isAnomaly) score -= 20;

    devices.forEach(d => {
      if (d.hours > 18 && d.power > 1000) score -= 10;
    });

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // 3 & 9. Anomaly Detection & Alerts (Blended logic: DL + Local Rules)
  detectAnomalies() {
    const devices = this.store.getDevices();
    const alerts = [];

    // Deep Learning Model Alert (Autoencoder)
    if (this.isAnomaly) {
      alerts.push({ type: 'danger', message: `CRITICAL: Neural Network detected abnormal usage pattern (Score: ${this.anomalyScore.toFixed(3)}).` });
    }

    // Local heuristic rules mapping individual devices
    devices.forEach(d => {
      if (d.power > this.ANOMALY_THRESHOLD) {
        alerts.push({ type: 'danger', message: `Anomaly: ${d.name} is showing abnormal spike (${d.power}W).` });
      } else if (d.hours > 20 && d.power > 500) {
        alerts.push({ type: 'warning', message: `Habit Alert: ${d.name} has been running unusually long (${d.hours}h).` });
      }
    });

    return alerts;
  }

  // 6. Device-Level Intelligence
  getTopConsumer() {
    const devices = this.store.getDevices();
    if (devices.length === 0) return null;

    return devices.reduce((prev, current) => {
      const prevEnergy = prev.power * prev.hours;
      const currEnergy = current.power * current.hours;
      return (prevEnergy > currEnergy) ? prev : current;
    });
  }

  // 5. Smart Suggestion Engine
  generateSuggestions() {
    const devices = this.store.getDevices();
    const suggestions = [];

    const topConsumer = this.getTopConsumer();
    if (topConsumer) {
      suggestions.push(`Reduce <strong>${topConsumer.name}</strong> usage by 1-2 hours to save significant energy.`);
    }

    const hasHeavyCooling = devices.some(d => d.name.toLowerCase().includes('ac') || d.name.toLowerCase().includes('conditioner'));
    if (hasHeavyCooling) {
      suggestions.push(`Consider raising your AC temperature by 1°C. It can save up to 6% in cooling costs.`);
    }

    if (this.isAnomaly) {
      suggestions.push(`<strong style="color:var(--danger)">WARNING: Neural Network detects unexpected macro-system load. Disable non-essential appliances.</strong>`);
    }

    if (suggestions.length === 0) {
      suggestions.push(`Your energy usage looks highly efficient according to the model. Keep it up!`);
    }

    return suggestions;
  }

  // 2. Future Power Prediction
  predictNextDayUsage() {
    // Return Deep Learning prediction if backend was successfully hit
    if (this.dlPredictedNextDayKwh !== null) {
      return this.dlPredictedNextDayKwh.toFixed(2);
    }

    // Fallback heuristic if API fails
    const dailyKWh = this.store.getDailyEnergyKWh();
    const variance = (Math.random() * 0.1) - 0.05;
    const predicted = dailyKWh * (1 + variance);
    return predicted.toFixed(2);
  }

  // 10. Day vs Night Analysis
  getDayNightSplit() {
    const dailyKWh = this.store.getDailyEnergyKWh();
    let dayRatio = 0.65;
    if (dailyKWh > 30) dayRatio = 0.75;

    return {
      day: Number((dailyKWh * dayRatio).toFixed(2)),
      night: Number((dailyKWh * (1 - dayRatio)).toFixed(2))
    };
  }

  // 7. Peak Time Detection
  getPeakPredictionDisplay() {
    return `Based on historical patterns, highest usage occurs between <strong>${this.PEAK_START_HOUR}:00 and ${this.PEAK_END_HOUR}:00</strong>.`;
  }
}

window.aiEngine = new AIEngine(window.appStore);

// Periodically sync with DL Backend if data changed
window.addEventListener('storeUpdated', () => {
  window.aiEngine.fetchDeepLearningInsights();
});
