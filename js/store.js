// Central Store to manage data via Python SQLite API & Local Storage Fallback

const API_BASE_URL = 'http://127.0.0.1:5000/api';
const LOCAL_STORAGE_KEY = 'ai_power_system_cache';

const DEFAULT_DEVICES = [
  { id: '1', name: 'Refrigerator', power: 150, hours: 24, timestamp: Date.now() - 86400000 },
  { id: '2', name: 'Air Conditioner', power: 2000, hours: 4, timestamp: Date.now() - 43200000 },
  { id: '3', name: 'Gaming PC', power: 600, hours: 5, timestamp: Date.now() - 10000000 }
];

class Store {
  constructor() {
    this.devices = [];
    this.loadData();
  }

  // --- Helper: Save to Local Storage ---
  saveToLocalCache(devicesArray) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devicesArray));
    this.devices = devicesArray;
    // Tell the website to redraw
    window.dispatchEvent(new CustomEvent('storeUpdated', { detail: this.devices }));
  }

  // --- Load Data (Online or Offline) ---
  async loadData() {
    try {
      // 1. Try to fetch from the Python Database (Server is ON)
      const response = await fetch(`${API_BASE_URL}/devices`);
      if (response.ok) {
        const dbData = await response.json();
        // If successful, save this fresh data to our browser's backup cache
        this.saveToLocalCache(dbData);
      }
    } catch (e) {
      // 2. Python Server is OFF! Fall back to browser memory (Local Storage)
      console.warn("Python Server is OFF. Loading data from Local Storage backup.");
      
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) {
        // We found old data in the browser
        this.saveToLocalCache(JSON.parse(localData));
      } else {
        // Browser is completely empty, use the 3 default dummy devices
        this.saveToLocalCache([...DEFAULT_DEVICES]);
      }
    }
  }

  // --- Add a new Device ---
  async addDevice(name, power, hours) {
    const newDevice = {
      id: Date.now().toString(),
      name,
      power: parseFloat(power),
      hours: parseFloat(hours),
      timestamp: Date.now()
    };
    
    // 1. Save to Local Cache immediately (so the screen updates instantly)
    const updatedArray = [...this.devices, newDevice];
    this.saveToLocalCache(updatedArray);

    // 2. Try to save it to the Python Database permanently
    try {
      await fetch(`${API_BASE_URL}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDevice)
      });
    } catch (e) {
      console.error("Server is OFF: Device saved locally only.");
    }
  }

  // --- Remove a Device ---
  async removeDevice(id) {
    // 1. Remove it from Local Cache
    const updatedArray = this.devices.filter(d => d.id !== id);
    this.saveToLocalCache(updatedArray);

    // 2. Try to remove it from Python Database
    try {
      await fetch(`${API_BASE_URL}/devices/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error("Server is OFF: Device deleted locally only.");
    }
  }

  // --- Clear All Devices ---
  async clearAll() {
    this.saveToLocalCache([]);
    try {
      await fetch(`${API_BASE_URL}/devices`, { method: 'DELETE' });
    } catch (e) {
      console.error("Server is OFF: Devices cleared locally only.");
    }
  }

  getDevices() {
    return this.devices;
  }

  getTotalPower() {
    return this.devices.reduce((acc, curr) => acc + curr.power, 0);
  }

  getDailyEnergyKWh() {
    return this.devices.reduce((acc, curr) => acc + (curr.power * curr.hours) / 1000, 0);
  }
}

// Global instance
window.appStore = new Store();
