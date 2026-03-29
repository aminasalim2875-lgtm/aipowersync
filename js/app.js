// Main App Logic handling DOM updates

document.addEventListener('DOMContentLoaded', () => {
  const store = window.appStore;
  const ai = window.aiEngine;

  // Real-time clock update
  const timeEl = document.getElementById('current-time');
  if (timeEl) {
    setInterval(() => {
      const now = new Date();
      timeEl.textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }, 1000);
  }

  // Function to render main dashboard metrics
  function renderDashboard() {
    // Only run on dashboard page
    if (!document.getElementById('total-power')) return;

    const devices = store.getDevices();
    const totalPower = store.getTotalPower();
    const score = ai.calculateEfficiencyScore();
    const nextDayKwh = parseFloat(ai.predictNextDayUsage());
    const monthlyBill = Math.round(nextDayKwh * 30 * 8); // ₹8 per kWh

    // Update Cards
    document.getElementById('total-power').textContent = `${totalPower} W`;
    document.getElementById('active-devices-count').textContent = devices.length;
    
    const billEl = document.getElementById('monthly-bill');
    if (billEl) {
      billEl.textContent = `₹ ${monthlyBill.toLocaleString('en-IN')}`;
    }
    
    const powerStatusEl = document.getElementById('power-status');
    if (totalPower > ai.ANOMALY_THRESHOLD) {
      powerStatusEl.textContent = 'High Load Detected';
      powerStatusEl.style.color = 'var(--danger)';
    } else if (totalPower > 1000) {
      powerStatusEl.textContent = 'Moderate Load';
      powerStatusEl.style.color = 'var(--warning)';
    } else {
      powerStatusEl.textContent = 'Normal Load';
      powerStatusEl.style.color = 'var(--success)';
    }

    // Update Efficiency Score & Bar
    const scoreEl = document.getElementById('efficiency-score');
    const barEl = document.getElementById('efficiency-bar');
    scoreEl.textContent = `${score}/100`;
    barEl.style.width = `${score}%`;
    if (score < 50) barEl.style.background = 'var(--danger)';
    else if (score < 80) barEl.style.background = 'var(--warning)';
    else barEl.style.background = 'var(--success)';

    renderDeviceList(devices);
    renderAlerts();
  }

  function renderDeviceList(devices) {
    const container = document.getElementById('device-list-container');
    container.innerHTML = '';

    if (devices.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted);">No devices active. Add some data.</p>';
      return;
    }

    const topConsumer = ai.getTopConsumer();

    devices.forEach(d => {
      const isTop = topConsumer && topConsumer.id === d.id;
      const energy = (d.power * d.hours) / 1000;
      
      const div = document.createElement('div');
      div.className = 'device-item fade-in';
      div.innerHTML = `
        <div>
          <h4 style="display: flex; align-items: center; gap: 8px;">
            ${d.name}
            ${isTop ? '<span style="font-size: 0.7rem; background: var(--danger); padding: 2px 6px; border-radius: 4px; color: white;">Top Consumer</span>' : ''}
          </h4>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${d.power}W for ${d.hours}h (${energy.toFixed(1)} kWh/day)</span>
        </div>
        <button onclick="window.removeDeviceUI('${d.id}')" style="background: transparent; color: var(--text-muted); border: none; cursor: pointer;">✕</button>
      `;
      container.appendChild(div);
    });
  }

  function renderAlerts() {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';
    
    const alerts = ai.detectAnomalies();
    
    alerts.forEach(alert => {
      const div = document.createElement('div');
      const colorVar = alert.type === 'danger' ? 'var(--danger)' : 'var(--warning)';
      const bgColor = alert.type === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
      
      div.style.cssText = `
        background: ${bgColor};
        border-left: 4px solid ${colorVar};
        color: var(--text-main);
        padding: 12px 20px;
        border-radius: 4px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 12px;
        animation: fadeIn 0.3s ease;
      `;
      
      div.innerHTML = `
        <span style="color: ${colorVar}; font-weight: bold;">!</span>
        <span>${alert.message}</span>
      `;
      container.appendChild(div);
    });
  }

  // Form Handling
  const addForm = document.getElementById('add-device-form');
  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('device-name').value;
      const power = document.getElementById('device-power').value;
      const hours = document.getElementById('device-hours').value;
      
      store.addDevice(name, power, hours);
      addForm.reset();
    });
  }

  const clearBtn = document.getElementById('clear-data-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      store.clearAll();
    });
  }

  // Global remove function for inline onclick
  window.removeDeviceUI = function(id) {
    store.removeDevice(id);
  };

  // Listen to store updates
  window.addEventListener('storeUpdated', () => {
    renderDashboard();
    // Dispatch custom event for charts to catch and redraw
    window.dispatchEvent(new CustomEvent('reDrawCharts'));
  });

  // Initial render
  setTimeout(() => renderDashboard(), 50);
});

// Analytics View Chart Initialization
window.initAnalytics = function() {
  const store = window.appStore;
  const ai = window.aiEngine;

  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = 'Inter';

  let deviceChart, dayNightChart, predictionChart;

  function drawCharts() {
    const devices = store.getDevices();
    
    // Suggestion population
    const peakPredictionEl = document.getElementById('peak-prediction');
    if (peakPredictionEl) peakPredictionEl.innerHTML = ai.getPeakPredictionDisplay();

    const suggestionsEl = document.getElementById('ai-suggestions');
    if (suggestionsEl) {
      const suggestions = ai.generateSuggestions();
      suggestionsEl.innerHTML = suggestions.map(s => `<li style="margin-bottom: 8px;">${s}</li>`).join('');
    }

    // 1. Device Chart
    const devCtx = document.getElementById('deviceChart');
    if (devCtx) {
      if (deviceChart) deviceChart.destroy();
      deviceChart = new Chart(devCtx, {
        type: 'doughnut',
        data: {
          labels: devices.map(d => d.name),
          datasets: [{
            data: devices.map(d => (d.power * d.hours) / 1000), // kWh
            backgroundColor: [
              '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'
            ],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' }
          }
        }
      });
    }

    // 2. Day vs Night Chart
    const dnCtx = document.getElementById('dayNightChart');
    if (dnCtx) {
      if (dayNightChart) dayNightChart.destroy();
      const dnSplit = ai.getDayNightSplit();
      dayNightChart = new Chart(dnCtx, {
        type: 'bar',
        data: {
          labels: ['Day (6AM-6PM)', 'Night (6PM-6AM)'],
          datasets: [{
            label: 'Energy (kWh)',
            data: [dnSplit.day, dnSplit.night],
            backgroundColor: ['#f59e0b', '#3b82f6'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // 3. Prediction Chart (Trend Line)
    const predCtx = document.getElementById('predictionChart');
    if (predCtx) {
      if (predictionChart) predictionChart.destroy();
      const current = store.getDailyEnergyKWh();
      const nextDay = ai.predictNextDayUsage();
      
      predictionChart = new Chart(predCtx, {
        type: 'line',
        data: {
          labels: ['Yesterday', 'Today', 'Tomorrow (Predicted)'],
          datasets: [{
            label: 'Usage Trend (kWh)',
            data: [(current * 0.9).toFixed(2), current.toFixed(2), nextDay],
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  drawCharts();
  window.addEventListener('reDrawCharts', drawCharts);
  window.addEventListener('dlUpdate', drawCharts);
  window.addEventListener('dlUpdate', renderDashboard);
};
