/**
 * Real-time Data Synchronization Watcher
 * Polls the backend for data version changes and triggers refresh events.
 */
class DataSyncWatcher {
    constructor(interval = 5000) {
        this.interval = interval;
        this.lastVersion = null;
        this.timer = null;
        this.onUpdateCallbacks = [];
    }

    async checkVersion() {
        try {
            const response = await fetch('/api/system/version');
            if (!response.ok) throw new Error('Version check failed');
            
            const data = await response.json();
            const currentVersion = data.timestamp;

            if (this.lastVersion !== null && this.lastVersion !== currentVersion) {
                console.log('🔄 Data update detected! Refreshing UI...');
                this.triggerUpdate();
            }

            this.lastVersion = currentVersion;
        } catch (error) {
            console.warn('Real-time sync error:', error);
        }
    }

    triggerUpdate() {
        // Dispatch a global event so any component can listen for it
        const event = new CustomEvent('smartRetailDataUpdated', {
            detail: { timestamp: this.lastVersion }
        });
        window.dispatchEvent(event);

        // Also call registered callbacks
        this.onUpdateCallbacks.forEach(cb => cb(this.lastVersion));
    }

    onUpdate(callback) {
        this.onUpdateCallbacks.push(callback);
    }

    start() {
        if (this.timer) return;
        
        // Initial check
        this.checkVersion();
        
        // Setup polling
        this.timer = setInterval(() => this.checkVersion(), this.interval);
        console.log(`📡 Real-time sync started (Interval: ${this.interval}ms)`);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}

// Initialize global watcher
const realtimeWatcher = new DataSyncWatcher();
realtimeWatcher.start();
