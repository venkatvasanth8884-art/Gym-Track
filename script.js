// State Management and LocalStorage Wrapper
const Storage = {
    KEYS: {
        DAILY: 'gymTracker_daily',
        FOOD: 'gymTracker_food',
        BACKUP_LOGS: 'gymTracker_backups',
        RECENT_FOODS: 'gymTracker_recentFoods'
    },
    
    // Get all daily entries
    getDailyEntries: function() {
        return JSON.parse(localStorage.getItem(this.KEYS.DAILY) || '{}');
    },
    
    // Get entry for a specific date (YYYY-MM-DD)
    getDailyEntry: function(dateStr) {
        const entries = this.getDailyEntries();
        return entries[dateStr] || { weight: '', workout: '', cardio: '' };
    },
    
    // Save daily entry
    saveDailyEntry: function(dateStr, data) {
        const entries = this.getDailyEntries();
        entries[dateStr] = data;
        localStorage.setItem(this.KEYS.DAILY, JSON.stringify(entries));
    },

    // Get all food logs
    getFoodLogs: function() {
        return JSON.parse(localStorage.getItem(this.KEYS.FOOD) || '{}');
    },

    // Get food logs for a specific date
    getFoodLogForDate: function(dateStr) {
        const logs = this.getFoodLogs();
        return logs[dateStr] || [];
    },

    // Add a food item to a specific date
    addFoodItem: function(dateStr, item) {
        const logs = this.getFoodLogs();
        if (!logs[dateStr]) logs[dateStr] = [];
        // item should have: id, mealType, name, weight, calories, protein, carbs, fat, fiber
        item.id = Date.now().toString(); // simple unique ID
        logs[dateStr].push(item);
        localStorage.setItem(this.KEYS.FOOD, JSON.stringify(logs));
        
        // Also add to Recent Foods cache
        this.saveRecentFood({
            name: item.name,
            cal: (item.calories / (item.weight / 100)), // store base per 100g
            pro: (item.protein / (item.weight / 100)),
            carb: (item.carbs / (item.weight / 100)),
            fat: (item.fat / (item.weight / 100)),
            fib: (item.fiber / (item.weight / 100))
        });
    },

    // Delete a food item
    deleteFoodItem: function(dateStr, itemId) {
        const logs = this.getFoodLogs();
        if (logs[dateStr]) {
            logs[dateStr] = logs[dateStr].filter(i => i.id !== itemId);
            localStorage.setItem(this.KEYS.FOOD, JSON.stringify(logs));
        }
    },
    
    // Get recent foods cache
    getRecentFoods: function() {
        return JSON.parse(localStorage.getItem(this.KEYS.RECENT_FOODS) || '[]');
    },
    
    // Save to recent foods cache
    saveRecentFood: function(baseItem) {
        let recents = this.getRecentFoods();
        // Remove if exists to put it at the top
        recents = recents.filter(f => f.name.toLowerCase() !== baseItem.name.toLowerCase());
        recents.unshift(baseItem); // Add to beginning
        if (recents.length > 20) recents.pop(); // Keep only last 20
        localStorage.setItem(this.KEYS.RECENT_FOODS, JSON.stringify(recents));
    }
};

// Application Controller
const App = {
    currentDate: '',
    deferredPrompt: null, // Stores the PWA install prompt event

    // Returns a human-readable date string, e.g. "Sunday, 15 Mar 2026"
    formatDate: function(dateStr) {
        if (!dateStr) return '';
        // Parse as local date (not UTC) to avoid off-by-one
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    },

    init: function() {
        this.setupNavigation();
        this.setupDateHandling();
        this.setupDailyForm();
        this.setupPWAInstall();
        this.setupBackupTools();
        
        // Initialize date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('input-date').value = today;
        this.handleDateChange(today);
    },

    setupNavigation: function() {
        const navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.dataset.target;
                
                // Update active button
                navBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // Update active view
                document.querySelectorAll('.view-section').forEach(sec => {
                    sec.classList.remove('active');
                });
                document.getElementById(targetId).classList.add('active');

                // Trigger view-specific reloads
                if (targetId === 'view-dashboard') {
                    this.updateMacroSummary();
                } else if (targetId === 'view-food') {
                    FoodTracker.loadView();
                } else if (targetId === 'view-analytics') {
                    Analytics.loadView();
                }
            });
        });
    },

    setupPWAInstall: function() {
        const installPanel = document.getElementById('panel-install-app');
        const installBtn = document.getElementById('btn-install-app');

        // Listen for the PWA "ready to install" event
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            this.deferredPrompt = e;
            // Update UI notify the user they can install the PWA
            installPanel.hidden = false;
        });

        installBtn.addEventListener('click', async () => {
            if (!this.deferredPrompt) return;
            // Show the install prompt
            this.deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            this.deferredPrompt = null;
            // Hide the install button
            installPanel.hidden = true;
        });

        window.addEventListener('appinstalled', (evt) => {
            console.log('7F FIT was installed.');
            installPanel.hidden = true;
        });
    },

    setupBackupTools: function() {
        document.getElementById('btn-export-excel').addEventListener('click', () => {
            this.exportData();
        });
        document.getElementById('btn-import-excel').addEventListener('click', () => {
            document.getElementById('input-import-file').click();
        });
        document.getElementById('input-import-file').addEventListener('change', (e) => {
            this.importData(e.target.files[0]);
        });
        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm('CRITICAL: This will permanently delete ALL your gym data. Are you sure?')) {
                localStorage.clear();
                location.reload();
            }
        });
    },

    exportData: function() {
        // Simple JSON export as fallback to Excel
        const data = {
            daily: Storage.getDailyEntries(),
            food: Storage.getFoodLogs()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `7FFIT_Backup_${this.currentDate}.json`;
        a.click();
    },

    importData: function(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.daily && data.food) {
                    localStorage.setItem(Storage.KEYS.DAILY, JSON.stringify(data.daily));
                    localStorage.setItem(Storage.KEYS.FOOD, JSON.stringify(data.food));
                    alert('Backup restored successfully!');
                    location.reload();
                }
            } catch (err) {
                alert('Invalid backup file.');
            }
        };
        reader.readAsText(file);
    },

    setupDateHandling: function() {
        const dateInput = document.getElementById('input-date');
        const btnPrev = document.getElementById('btn-prev-day');
        const btnNext = document.getElementById('btn-next-day');

        dateInput.addEventListener('change', (e) => {
            this.handleDateChange(e.target.value);
        });

        btnPrev.addEventListener('click', () => this.changeDateByDays(-1));
        btnNext.addEventListener('click', () => this.changeDateByDays(1));
    },

    changeDateByDays: function(days) {
        if (!this.currentDate) return;
        const date = new Date(this.currentDate);
        date.setDate(date.getDate() + days);
        const newDateStr = date.toISOString().split('T')[0];
        document.getElementById('input-date').value = newDateStr;
        this.handleDateChange(newDateStr);
    },

    handleDateChange: function(dateStr) {
        this.currentDate = dateStr;
        const readableDate = this.formatDate(dateStr);

        // Sync date display everywhere
        const foodDisplay = document.getElementById('food-date-display');
        if (foodDisplay) foodDisplay.innerText = readableDate;
        
        // Load existing daily data for this date
        const data = Storage.getDailyEntry(dateStr);
        document.getElementById('input-weight').value = data.weight || '';
        document.getElementById('input-workout').value = data.workout || '';
        document.getElementById('input-cardio').value = data.cardio || '';

        // Update Macro Summary based on food logs
        this.updateMacroSummary();
    },

    setupDailyForm: function() {
        const form = document.getElementById('daily-form');
        const btnClear = document.getElementById('btn-clear-daily');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = {
                weight: document.getElementById('input-weight').value,
                workout: document.getElementById('input-workout').value,
                cardio: document.getElementById('input-cardio').value
            };
            Storage.saveDailyEntry(this.currentDate, data);
            
            // Visual feedback
            const saveBtn = document.getElementById('btn-save-daily');
            const originalText = saveBtn.innerText;
            saveBtn.innerText = "SAVED ✓";
            saveBtn.style.backgroundColor = "var(--success)";
            saveBtn.style.color = "#fff";
            setTimeout(() => {
                saveBtn.innerText = originalText;
                saveBtn.style.backgroundColor = "var(--accent-color)";
                saveBtn.style.color = "var(--bg-dark)";
            }, 2000);
        });

        btnClear.addEventListener('click', () => {
            document.getElementById('input-weight').value = '';
            document.getElementById('input-workout').value = '';
            document.getElementById('input-cardio').value = '';
            // Note: Does not delete from storage until Save is pressed
        });
    },

    updateMacroSummary: function() {
        if (!this.currentDate) return;
        
        const logs = Storage.getFoodLogForDate(this.currentDate);
        
        let totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
        
        logs.forEach(item => {
            totals.calories += Number(item.calories) || 0;
            totals.protein += Number(item.protein) || 0;
            totals.carbs += Number(item.carbs) || 0;
            totals.fat += Number(item.fat) || 0;
            totals.fiber += Number(item.fiber) || 0;
        });

        // Update DOM
        document.getElementById('summary-calories').innerText = Math.round(totals.calories);
        document.getElementById('summary-protein').innerText = Math.round(totals.protein);
        document.getElementById('summary-carbs').innerText = Math.round(totals.carbs);
        document.getElementById('summary-fat').innerText = Math.round(totals.fat);
        document.getElementById('summary-fiber').innerText = Math.round(totals.fiber);
    }
};

// --- Food Tracker Module ---
const FoodTracker = {
    selectedFoodMacroBase: null, // Base macros per 100g
    // Comprehensive Food Database (Macros per 100g)
    mockDB: [
        // 1. Indian Vegetables
        { name: 'Potato', cal: 77, pro: 2, carb: 17, fat: 0.1, fib: 2.2 },
        { name: 'Sweet Potato', cal: 86, pro: 1.6, carb: 20, fat: 0.1, fib: 3 },
        { name: 'Onion', cal: 40, pro: 1.1, carb: 9, fat: 0.1, fib: 1.7 },
        { name: 'Tomato', cal: 18, pro: 0.9, carb: 3.9, fat: 0.2, fib: 1.2 },
        { name: 'Carrot', cal: 41, pro: 0.9, carb: 10, fat: 0.2, fib: 2.8 },
        { name: 'Beetroot', cal: 43, pro: 1.6, carb: 9.6, fat: 0.2, fib: 2.8 },
        { name: 'Radish', cal: 16, pro: 0.7, carb: 3.4, fat: 0.1, fib: 1.6 },
        { name: 'Turnip', cal: 28, pro: 0.9, carb: 6, fat: 0.1, fib: 1.8 },
        { name: 'Drumstick', cal: 37, pro: 2.1, carb: 8.5, fat: 0.1, fib: 3.2 },
        { name: 'Drumstick Leaves', cal: 64, pro: 9.4, carb: 8.3, fat: 1.4, fib: 2 },
        { name: 'Spinach', cal: 23, pro: 2.9, carb: 3.6, fat: 0.4, fib: 2.2 },
        { name: 'Amaranth Leaves', cal: 23, pro: 2.5, carb: 4, fat: 0.3, fib: 1.5 },
        { name: 'Fenugreek Leaves (Methi)', cal: 49, pro: 4.4, carb: 6, fat: 0.9, fib: 1.1 },
        { name: 'Mint Leaves', cal: 70, pro: 4.8, carb: 15, fat: 0.9, fib: 8 },
        { name: 'Coriander Leaves', cal: 23, pro: 2.1, carb: 3.7, fat: 0.5, fib: 2.8 },
        { name: 'Cabbage', cal: 25, pro: 1.3, carb: 5.8, fat: 0.1, fib: 2.5 },
        { name: 'Red Cabbage', cal: 31, pro: 1.4, carb: 7, fat: 0.2, fib: 2.1 },
        { name: 'Cauliflower', cal: 25, pro: 1.9, carb: 5, fat: 0.3, fib: 2 },
        { name: 'Broccoli', cal: 34, pro: 2.8, carb: 6.6, fat: 0.4, fib: 2.6 },
        { name: 'Brinjal (Eggplant)', cal: 25, pro: 1, carb: 6, fat: 0.2, fib: 3 },
        { name: 'Green Chilli', cal: 40, pro: 2, carb: 9, fat: 0.4, fib: 1.5 },
        { name: 'Red Chilli', cal: 40, pro: 2, carb: 9, fat: 0.4, fib: 1.5 },
        { name: 'Capsicum (Green)', cal: 20, pro: 0.9, carb: 4.6, fat: 0.2, fib: 1.7 },
        { name: 'Capsicum (Red)', cal: 31, pro: 1, carb: 6, fat: 0.3, fib: 2.1 },
        { name: 'Capsicum (Yellow)', cal: 27, pro: 1, carb: 6.3, fat: 0.2, fib: 0.9 },
        { name: 'Pumpkin', cal: 26, pro: 1, carb: 6.5, fat: 0.1, fib: 0.5 },
        { name: 'Ash Gourd', cal: 13, pro: 0.4, carb: 3, fat: 0.1, fib: 0.6 },
        { name: 'Bottle Gourd (Lauki)', cal: 15, pro: 0.6, carb: 3.4, fat: 0.1, fib: 0.5 },
        { name: 'Ridge Gourd', cal: 20, pro: 1.2, carb: 3.4, fat: 0.2, fib: 0.5 },
        { name: 'Snake Gourd', cal: 18, pro: 0.6, carb: 3.3, fat: 0.3, fib: 0.6 },
        { name: 'Bitter Gourd (Karela)', cal: 17, pro: 1, carb: 3.7, fat: 0.2, fib: 2.8 },
        { name: 'Ivy Gourd (Kovakkai)', cal: 18, pro: 1.2, carb: 3.1, fat: 0.1, fib: 1.6 },
        { name: 'Pointed Gourd (Parwal)', cal: 20, pro: 1.5, carb: 2.2, fat: 0.3, fib: 2.1 },
        { name: 'Cucumber', cal: 15, pro: 0.7, carb: 3.6, fat: 0.1, fib: 0.5 },
        { name: 'Zucchini', cal: 17, pro: 1.2, carb: 3.1, fat: 0.3, fib: 1 },
        { name: 'Green Beans', cal: 31, pro: 1.8, carb: 7, fat: 0.2, fib: 2.7 },
        { name: 'French Beans', cal: 26, pro: 1.7, carb: 4.5, fat: 0.1, fib: 3.2 },
        { name: 'Cluster Beans', cal: 15, pro: 3.2, carb: 10.8, fat: 0.4, fib: 5.4 },
        { name: 'Broad Beans (Avarakkai)', cal: 48, pro: 4.5, carb: 9.6, fat: 0.1, fib: 4.8 },
        { name: 'Peas', cal: 81, pro: 5, carb: 14, fat: 0.4, fib: 5 },
        { name: 'Corn', cal: 86, pro: 3.2, carb: 19, fat: 1.2, fib: 2.7 },
        { name: 'Baby Corn', cal: 26, pro: 2, carb: 5, fat: 0.2, fib: 1.5 },
        { name: 'Mushroom', cal: 22, pro: 3.1, carb: 3.3, fat: 0.3, fib: 1 },
        { name: 'Raw Banana', cal: 122, pro: 1.3, carb: 32, fat: 0.3, fib: 2.6 },
        { name: 'Plantain Stem', cal: 14, pro: 0.5, carb: 3, fat: 0.1, fib: 1 },
        { name: 'Plantain Flower', cal: 51, pro: 1.6, carb: 10, fat: 0.6, fib: 1.3 },
        { name: 'Colocasia (Arbi)', cal: 112, pro: 1.5, carb: 26, fat: 0.2, fib: 4.1 },
        { name: 'Yam', cal: 118, pro: 1.5, carb: 28, fat: 0.2, fib: 4.1 },
        { name: 'Taro Root', cal: 112, pro: 1.5, carb: 26, fat: 0.2, fib: 4.1 },

        // 2. Cereals and Grains
        { name: 'White Rice', cal: 130, pro: 2.7, carb: 28, fat: 0.3, fib: 0.4 },
        { name: 'Brown Rice', cal: 111, pro: 2.6, carb: 23, fat: 0.9, fib: 1.8 },
        { name: 'Basmati Rice', cal: 121, pro: 3.5, carb: 25, fat: 0.4, fib: 0.4 },
        { name: 'Red Rice', cal: 109, pro: 2.3, carb: 23, fat: 0.8, fib: 2 },
        { name: 'Black Rice', cal: 335, pro: 8.5, carb: 72, fat: 2.5, fib: 4.9 },
        { name: 'Broken Rice', cal: 360, pro: 7, carb: 80, fat: 0.5, fib: 1 },
        { name: 'Wheat', cal: 340, pro: 13.2, carb: 72, fat: 2.5, fib: 10.7 },
        { name: 'Whole Wheat', cal: 339, pro: 13.2, carb: 71, fat: 2.5, fib: 10.7 },
        { name: 'Broken Wheat (Dalia)', cal: 342, pro: 12, carb: 76, fat: 1.5, fib: 6.7 },
        { name: 'Semolina (Rava)', cal: 360, pro: 13, carb: 73, fat: 1.1, fib: 3.9 },
        { name: 'Barley', cal: 354, pro: 12.5, carb: 73.5, fat: 2.3, fib: 17 },
        { name: 'Oats', cal: 389, pro: 16.9, carb: 66, fat: 6.9, fib: 10.6 },
        { name: 'Rolled Oats', cal: 379, pro: 13, carb: 68, fat: 6.5, fib: 10 },
        { name: 'Steel Cut Oats', cal: 375, pro: 12.5, carb: 67, fat: 6, fib: 10 },
        { name: 'Maize', cal: 86, pro: 3.2, carb: 19, fat: 1.2, fib: 2.7 },
        { name: 'Finger Millet (Ragi)', cal: 328, pro: 7.3, carb: 72, fat: 1.3, fib: 3.6 },
        { name: 'Pearl Millet (Bajra)', cal: 361, pro: 11.6, carb: 67, fat: 5, fib: 1.3 },
        { name: 'Foxtail Millet (Thinai)', cal: 331, pro: 12.3, carb: 60.9, fat: 4.3, fib: 8 },
        { name: 'Little Millet (Samai)', cal: 341, pro: 7.7, carb: 67, fat: 4.7, fib: 7.6 },
        { name: 'Barnyard Millet', cal: 342, pro: 6.2, carb: 65, fat: 4.8, fib: 10 },
        { name: 'Kodo Millet (Varagu)', cal: 302, pro: 8.3, carb: 65.9, fat: 1.4, fib: 9 },
        { name: 'Sorghum (Jowar)', cal: 339, pro: 11.3, carb: 74.6, fat: 3.3, fib: 6.7 },
        { name: 'Proso Millet', cal: 378, pro: 11, carb: 70, fat: 4.2, fib: 8.5 },
        { name: 'Quinoa', cal: 120, pro: 4.4, carb: 21, fat: 1.9, fib: 2.8 },
        { name: 'Amaranth Grain', cal: 371, pro: 13.6, carb: 65, fat: 7, fib: 6.7 },

        // 3. Indian Pulses and Dhal
        { name: 'Toor Dal (Arhar)', cal: 343, pro: 22, carb: 63, fat: 1.5, fib: 15 },
        { name: 'Moong Dal (Yellow)', cal: 348, pro: 24, carb: 63, fat: 1.2, fib: 16 },
        { name: 'Green Gram (Whole Moong)', cal: 347, pro: 24, carb: 63, fat: 1.2, fib: 16 },
        { name: 'Urad Dal (Black Gram)', cal: 341, pro: 25, carb: 59, fat: 1.6, fib: 18 },
        { name: 'Chana Dal', cal: 372, pro: 20, carb: 60, fat: 5, fib: 10 },
        { name: 'Bengal Gram', cal: 364, pro: 19, carb: 61, fat: 6, fib: 17 },
        { name: 'Black Chana', cal: 360, pro: 20, carb: 60, fat: 6, fib: 17 },
        { name: 'Kabuli Chana (Chickpeas)', cal: 364, pro: 19, carb: 61, fat: 6, fib: 17 },
        { name: 'Masoor Dal (Red)', cal: 353, pro: 25, carb: 60, fat: 1, fib: 11 },
        { name: 'Horse Gram (Kollu)', cal: 321, pro: 22, carb: 57, fat: 0.5, fib: 5 },
        { name: 'Cowpea (Lobia)', cal: 336, pro: 23.5, carb: 60, fat: 1.3, fib: 10.6 },
        { name: 'Green Peas (Dry)', cal: 341, pro: 24.5, carb: 60, fat: 1.2, fib: 25.5 },
        { name: 'Rajma (Kidney Beans)', cal: 333, pro: 24, carb: 60, fat: 0.8, fib: 25 },
        { name: 'Field Beans (Mochai)', cal: 341, pro: 24.5, carb: 60, fat: 1.3, fib: 10.6 },
        { name: 'Soybeans', cal: 446, pro: 36, carb: 30, fat: 20, fib: 9 },

        // 4. Oils and Fats
        { name: 'Sunflower Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Groundnut Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Peanut Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Mustard Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Coconut Oil', cal: 862, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Palm Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Rice Bran Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Sesame Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Olive Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Extra Virgin Olive Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Canola Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Flaxseed Oil', cal: 884, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Butter', cal: 717, pro: 0.8, carb: 0.1, fat: 81, fib: 0 },
        { name: 'Ghee', cal: 900, pro: 0, carb: 0, fat: 100, fib: 0 },
        { name: 'Margarine', cal: 717, pro: 0.2, carb: 0.7, fat: 81, fib: 0 },

        // 5. Egg Foods
        { name: 'Whole Egg', cal: 143, pro: 12.6, carb: 0.7, fat: 9.5, fib: 0 },
        { name: 'Egg White', cal: 52, pro: 10.9, carb: 0.7, fat: 0.2, fib: 0 },
        { name: 'Boiled Egg', cal: 155, pro: 12.6, carb: 1.1, fat: 10.6, fib: 0 },
        { name: 'Egg Omelette', cal: 154, pro: 13, carb: 1.2, fat: 11, fib: 0 },
        { name: 'Egg Scramble', cal: 149, pro: 10, carb: 1.5, fat: 11, fib: 0.1 },
        { name: 'Egg Bhurji', cal: 160, pro: 12, carb: 3.5, fat: 12, fib: 1 },

        // 6. Chicken Foods
        { name: 'Chicken Breast', cal: 165, pro: 31, carb: 0, fat: 3.6, fib: 0 },
        { name: 'Chicken Curry', cal: 130, pro: 12, carb: 6, fat: 7, fib: 1.5 },
        { name: 'Chicken Fry', cal: 245, pro: 20, carb: 5, fat: 15, fib: 0.5 },
        { name: 'Chicken Tikka', cal: 150, pro: 22, carb: 2, fat: 5, fib: 0.5 },
        { name: 'Grilled Chicken', cal: 170, pro: 25, carb: 1, fat: 6, fib: 0 },

        // 7. Rice Dishes
        { name: 'Jeera Rice', cal: 150, pro: 3, carb: 29, fat: 2.5, fib: 0.5 },
        { name: 'Curd Rice', cal: 110, pro: 3.5, carb: 18, fat: 2.5, fib: 0.5 },
        { name: 'Vegetable Rice', cal: 140, pro: 3, carb: 25, fat: 3, fib: 2 },
        { name: 'Biryani Rice', cal: 180, pro: 4, carb: 30, fat: 5, fib: 1 },

        // 8. South Indian Foods
        { name: 'Idli', cal: 115, pro: 3.5, carb: 24, fat: 0.4, fib: 1 },
        { name: 'Dosa', cal: 168, pro: 3.9, carb: 29, fat: 3.7, fib: 0.9 },
        { name: 'Masala Dosa', cal: 167, pro: 3.9, carb: 22.8, fat: 6.5, fib: 1.2 },
        { name: 'Plain Dosa', cal: 160, pro: 3.5, carb: 28, fat: 3, fib: 1 },
        { name: 'Rava Dosa', cal: 180, pro: 4, carb: 30, fat: 4.5, fib: 1.5 },
        { name: 'Set Dosa', cal: 175, pro: 4, carb: 26, fat: 5, fib: 1 },
        { name: 'Upma', cal: 130, pro: 3, carb: 22, fat: 3, fib: 2 },
        { name: 'Pongal', cal: 150, pro: 4, carb: 25, fat: 4, fib: 2 },
        { name: 'Medu Vada', cal: 280, pro: 6, carb: 35, fat: 12, fib: 3 },
        { name: 'Sambar', cal: 70, pro: 3, carb: 10, fat: 2, fib: 3 },
        { name: 'Coconut Chutney', cal: 140, pro: 2, carb: 5, fat: 12, fib: 3 },

        // 9. North Indian Foods
        { name: 'Chapati', cal: 297, pro: 9, carb: 60, fat: 3.5, fib: 9 },
        { name: 'Roti', cal: 297, pro: 9, carb: 60, fat: 3.5, fib: 9 },
        { name: 'Paratha', cal: 326, pro: 8, carb: 50, fat: 10, fib: 6 },
        { name: 'Paneer Butter Masala', cal: 230, pro: 8, carb: 10, fat: 17, fib: 2 },
        { name: 'Dal Tadka', cal: 120, pro: 6, carb: 15, fat: 4, fib: 4 },
        { name: 'Rajma', cal: 130, pro: 6, carb: 20, fat: 3, fib: 6 },
        { name: 'Chole', cal: 140, pro: 6, carb: 22, fat: 3, fib: 6 },

        // 10. Fruits Database
        { name: 'Apple', cal: 52, pro: 0.3, carb: 14, fat: 0.2, fib: 2.4 },
        { name: 'Banana', cal: 89, pro: 1.1, carb: 22.8, fat: 0.3, fib: 2.6 },
        { name: 'Orange', cal: 47, pro: 0.9, carb: 12, fat: 0.1, fib: 2.4 },
        { name: 'Mango', cal: 60, pro: 0.8, carb: 15, fat: 0.4, fib: 1.6 },
        { name: 'Papaya', cal: 43, pro: 0.5, carb: 11, fat: 0.3, fib: 1.7 },
        { name: 'Pineapple', cal: 50, pro: 0.5, carb: 13, fat: 0.1, fib: 1.4 },
        { name: 'Grapes', cal: 69, pro: 0.7, carb: 18, fat: 0.2, fib: 0.9 },
        { name: 'Watermelon', cal: 30, pro: 0.6, carb: 8, fat: 0.2, fib: 0.4 },
        { name: 'Muskmelon', cal: 34, pro: 0.8, carb: 8, fat: 0.2, fib: 0.9 },
        { name: 'Pomegranate', cal: 83, pro: 1.7, carb: 19, fat: 1.2, fib: 4 },
        { name: 'Strawberry', cal: 32, pro: 0.7, carb: 8, fat: 0.3, fib: 2 },
        { name: 'Blueberry', cal: 57, pro: 0.7, carb: 14, fat: 0.3, fib: 2.4 },
        { name: 'Raspberry', cal: 52, pro: 1.2, carb: 12, fat: 0.7, fib: 6.5 },
        { name: 'Blackberry', cal: 43, pro: 1.4, carb: 10, fat: 0.5, fib: 5.3 },
        { name: 'Kiwi', cal: 61, pro: 1.1, carb: 15, fat: 0.5, fib: 3 },
        { name: 'Dragon Fruit', cal: 60, pro: 1.2, carb: 13, fat: 1.5, fib: 3 },
        { name: 'Guava', cal: 68, pro: 2.6, carb: 14, fat: 1, fib: 5.4 },
        { name: 'Sapota (Chikoo)', cal: 83, pro: 0.4, carb: 20, fat: 1.1, fib: 5.3 },
        { name: 'Jackfruit', cal: 95, pro: 1.7, carb: 23, fat: 0.6, fib: 1.5 },
        { name: 'Custard Apple', cal: 94, pro: 2.1, carb: 24, fat: 0.3, fib: 4.4 },
        { name: 'Amla (Indian Gooseberry)', cal: 44, pro: 0.9, carb: 10, fat: 0.6, fib: 4.3 },
        { name: 'Jamun', cal: 62, pro: 0.7, carb: 14, fat: 0.3, fib: 0.6 },
        { name: 'Sweet Lime (Mosambi)', cal: 43, pro: 0.8, carb: 11, fat: 0.3, fib: 0.4 },
        { name: 'Lemon', cal: 29, pro: 1.1, carb: 9, fat: 0.3, fib: 2.8 },
        { name: 'Grapefruit', cal: 42, pro: 0.8, carb: 11, fat: 0.1, fib: 1.6 },
        { name: 'Lychee', cal: 66, pro: 0.8, carb: 17, fat: 0.4, fib: 1.3 },
        { name: 'Passion Fruit', cal: 97, pro: 2.2, carb: 23, fat: 0.7, fib: 10.4 },

        // 11. Dry Fruits
        { name: 'Almonds', cal: 579, pro: 21, carb: 22, fat: 50, fib: 12.5 },
        { name: 'Cashews', cal: 553, pro: 18, carb: 30, fat: 44, fib: 3.3 },
        { name: 'Walnuts', cal: 654, pro: 15, carb: 14, fat: 65, fib: 6.7 },
        { name: 'Pistachios', cal: 562, pro: 20, carb: 28, fat: 45, fib: 10 },
        { name: 'Dates', cal: 282, pro: 2.5, carb: 75, fat: 0.4, fib: 8 },
        { name: 'Raisins', cal: 299, pro: 3.1, carb: 79, fat: 0.5, fib: 3.7 },
        { name: 'Dry Fig', cal: 249, pro: 3.3, carb: 64, fat: 0.9, fib: 9.8 },
        { name: 'Dry Apricot', cal: 241, pro: 3.4, carb: 63, fat: 0.5, fib: 7.3 },

        // 12. Protein Foods
        { name: 'Paneer', cal: 265, pro: 18, carb: 1.2, fat: 20, fib: 0 },
        { name: 'Tofu', cal: 76, pro: 8, carb: 1.9, fat: 4.8, fib: 0.3 },
        { name: 'Soy Chunks', cal: 345, pro: 52, carb: 33, fat: 0.5, fib: 13 },
        { name: 'Milk', cal: 42, pro: 3.4, carb: 5, fat: 1, fib: 0 },
        { name: 'Curd', cal: 98, pro: 11, carb: 3.4, fat: 4.3, fib: 0 },
        { name: 'Greek Yogurt', cal: 59, pro: 10, carb: 3.6, fat: 0.4, fib: 0 },

        // 13. Gym Diet Foods
        { name: 'Peanut Butter', cal: 588, pro: 25, carb: 20, fat: 50, fib: 6 },
        { name: 'Protein Shake', cal: 80, pro: 15, carb: 3, fat: 1, fib: 0.5 },
        { name: 'Protein Bar', cal: 400, pro: 30, carb: 40, fat: 12, fib: 5 },

        // 14. Fast Foods
        { name: 'Burger', cal: 295, pro: 14, carb: 30, fat: 14, fib: 1.5 },
        { name: 'Pizza', cal: 266, pro: 11, carb: 33, fat: 10, fib: 2.3 },
        { name: 'French Fries', cal: 312, pro: 3.4, carb: 41, fat: 15, fib: 3.8 },
        { name: 'Sandwich', cal: 250, pro: 12, carb: 30, fat: 10, fib: 3 },
        { name: 'Noodles', cal: 138, pro: 4.5, carb: 25, fat: 2.1, fib: 1.2 },
        { name: 'Pasta', cal: 131, pro: 5, carb: 25, fat: 1.1, fib: 1.5 },
        { name: 'Fried Rice', cal: 163, pro: 4, carb: 27, fat: 4, fib: 1 }
    ],
    init: function() {
        this.setupSearch();
        this.setupCamera();
        this.setupManualEntry();
        this.setupConfirmationArea();
    },

    loadView: function() {
        document.getElementById('food-date-display').innerText = App.formatDate(App.currentDate);
        this.resetEntryArea();
        this.renderLoggedFoods();
    },

    setupSearch: function() {
        const input      = document.getElementById('input-food-search');
        const btnSearch  = document.getElementById('btn-search');
        const dropdown   = document.getElementById('search-suggestions');

        const showDropdown = (items, hasRecents) => {
            dropdown.innerHTML = '';
            if (items.length === 0) {
                const li = document.createElement('li');
                li.innerHTML = `<span class="tag-no-result">No results — try Manual Entry.</span>`;
                dropdown.appendChild(li);
            } else {
                items.forEach(match => {
                    const isRecent = hasRecents.includes(match.name);
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${match.name}</span>
                        ${isRecent ? '<span class="tag-recent">RECENT</span>' : ''}
                    `;
                    li.addEventListener('click', () => {
                        this.selectFood(match, isRecent);
                        dropdown.hidden = true;
                        input.value = '';
                    });
                    dropdown.appendChild(li);
                });
            }
            dropdown.hidden = false;
        };

        const performSearch = (rawQuery) => {
            const query = rawQuery.trim().toLowerCase();
            if (query.length < 1) {
                dropdown.hidden = true;
                return;
            }

            const recentList  = Storage.getRecentFoods().filter(f => f.name.toLowerCase().includes(query));
            const recentNames = recentList.map(f => f.name);

            const mockMatches = this.mockDB.filter(f => f.name.toLowerCase().includes(query));

            // Merge: recents first, then mockDB (dedup by name)
            const combined = [...recentList];
            mockMatches.forEach(m => {
                if (!combined.find(c => c.name.toLowerCase() === m.name.toLowerCase())) {
                    combined.push(m);
                }
            });

            showDropdown(combined, recentNames);
        };

        // Instant while typing
        input.addEventListener('input', e => performSearch(e.target.value));

        // Manual search button
        btnSearch.addEventListener('click', () => performSearch(input.value));

        // Press Enter in search box
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') performSearch(input.value);
        });

        // Close on outside click
        document.addEventListener('click', e => {
            if (!e.target.closest('.food-search-wrapper')) {
                dropdown.hidden = true;
            }
        });
    },

    setupCamera: function() {
        const btnCamera = document.getElementById('btn-camera');
        const fileInput = document.getElementById('input-camera-file');

        btnCamera.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', e => {
            if (e.target.files.length > 0) {
                alert('Simulating Gemini Vision...\nAnalysing your food image...');
                setTimeout(() => {
                    const detected = this.mockDB[Math.floor(Math.random() * this.mockDB.length)];
                    if (confirm(`Gemini Vision detected: "${detected.name}"\n\nIs this correct?`)) {
                        this.selectFood(detected, false);
                    }
                    fileInput.value = '';
                }, 900);
            }
        });
    },

    setupManualEntry: function() {
        const btnToggle  = document.getElementById('btn-toggle-manual');
        const panel      = document.getElementById('manual-entry-area');
        const btnConfirm = document.getElementById('btn-confirm-manual');

        btnToggle.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            if (!panel.hidden) {
                this.resetEntryArea(false); // hide confirmation but not manual
            }
        });

        btnConfirm.addEventListener('click', () => {
            const name = document.getElementById('manual-name').value.trim();
            if (!name) { alert('Please enter a food name.'); return; }

            const food = {
                name: name,
                cal:  parseFloat(document.getElementById('manual-cal').value)  || 0,
                pro:  parseFloat(document.getElementById('manual-pro').value)  || 0,
                carb: parseFloat(document.getElementById('manual-carb').value) || 0,
                fat:  parseFloat(document.getElementById('manual-fat').value)  || 0,
                fib:  parseFloat(document.getElementById('manual-fib').value)  || 0,
            };

            this.selectFood(food, false);
            panel.hidden = true;

            // Clear manual inputs
            ['manual-name','manual-cal','manual-pro','manual-carb','manual-fat','manual-fib']
                .forEach(id => document.getElementById(id).value = '');
        });
    },

    selectFood: function(foodData, isRecent = false) {
        this.selectedFoodMacroBase = foodData;

        document.getElementById('selected-food-name').innerText = foodData.name;

        const badge = document.getElementById('cache-badge');
        badge.hidden = !isRecent;

        const wInput = document.getElementById('input-food-weight');
        wInput.value = '100';

        document.getElementById('food-entry-area').hidden = false;
        this.updatePreview(100);

        // Live recalc as weight changes
        wInput.oninput = e => this.updatePreview(parseFloat(e.target.value) || 0);

        // Smooth scroll into view
        document.getElementById('food-entry-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    updatePreview: function(grams) {
        if (!this.selectedFoodMacroBase) return;
        const m = grams / 100;
        const f = this.selectedFoodMacroBase;
        document.getElementById('preview-cal').innerText  = (f.cal  * m).toFixed(1);
        document.getElementById('preview-pro').innerText  = (f.pro  * m).toFixed(1);
        document.getElementById('preview-carb').innerText = (f.carb * m).toFixed(1);
        document.getElementById('preview-fat').innerText  = (f.fat  * m).toFixed(1);
        document.getElementById('preview-fib').innerText  = (f.fib  * m).toFixed(1);
    },

    setupConfirmationArea: function() {
        document.getElementById('btn-cancel-food').addEventListener('click', () => this.resetEntryArea());

        document.getElementById('btn-add-food').addEventListener('click', () => {
            if (!this.selectedFoodMacroBase) return;

            const weight = parseFloat(document.getElementById('input-food-weight').value) || 0;
            if (weight <= 0) { alert('Please enter a valid weight in grams.'); return; }

            const m        = weight / 100;
            const f        = this.selectedFoodMacroBase;
            const mealType = document.getElementById('input-meal-type').value;

            const entry = {
                mealType,
                name:     f.name,
                weight,
                calories: (f.cal  * m).toFixed(1),
                protein:  (f.pro  * m).toFixed(1),
                carbs:    (f.carb * m).toFixed(1),
                fat:      (f.fat  * m).toFixed(1),
                fiber:    (f.fib  * m).toFixed(1)
            };

            if (confirm(`Save ${weight}g of "${entry.name}" to ${mealType}?`)) {
                Storage.addFoodItem(App.currentDate, entry);
                this.resetEntryArea();
                this.renderLoggedFoods();
                App.updateMacroSummary();

                const btn = document.getElementById('btn-add-food');
                const orig = btn.innerText;
                btn.innerText = 'SAVED ✓';
                btn.style.backgroundColor = 'var(--success)';
                setTimeout(() => {
                    btn.innerText = orig;
                    btn.style.backgroundColor = '';
                }, 1500);
            }
        });
    },

    resetEntryArea: function(hideManual = true) {
        this.selectedFoodMacroBase = null;
        document.getElementById('food-entry-area').hidden = true;
        document.getElementById('cache-badge').hidden = true;
        document.getElementById('input-food-weight').value = '';
        if (hideManual) {
            document.getElementById('manual-entry-area').hidden = true;
        }
    },

    renderLoggedFoods: function() {
        const container = document.getElementById('logged-foods-list');
        container.innerHTML = '';
        const logs = Storage.getFoodLogForDate(App.currentDate);

        if (logs.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px 0;">No foods logged yet for this date.</p>';
            return;
        }

        logs.forEach(log => {
            const div = document.createElement('div');
            div.className = 'logged-food-item';
            div.innerHTML = `
                <div class="logged-food-info">
                    <h4>${log.name} <span style="font-weight:400; font-size:0.85rem;">(${log.weight}g)</span></h4>
                    <p>${log.mealType} &nbsp;·&nbsp; ${log.calories} kcal &nbsp;·&nbsp; P: ${log.protein}g &nbsp;·&nbsp; C: ${log.carbs}g &nbsp;·&nbsp; F: ${log.fat}g</p>
                </div>
                <button class="btn-delete-food" data-id="${log.id}" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
            `;
            container.appendChild(div);
        });

        container.querySelectorAll('.btn-delete-food').forEach(btn => {
            btn.addEventListener('click', e => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Remove this food from the log?')) {
                    Storage.deleteFoodItem(App.currentDate, id);
                    this.renderLoggedFoods();
                    App.updateMacroSummary();
                }
            });
        });
    }
};

// --- Analytics Module ---
const Analytics = {
    chartInstance: null,

    init: function() {
        document.getElementById('btn-render-chart').addEventListener('click', () => {
            this.renderChart();
        });
    },

    loadView: function() {
        // Auto-render on tab open
        this.renderChart();
    },

    getAggregateDataForDate: function(dateStr, dailyCache, foodCache) {
        const dailyData = dailyCache[dateStr] || { weight: '', workout: '', cardio: '' };
        const weight = parseFloat(dailyData.weight) || 0;
        const cardio = parseFloat(dailyData.cardio) || 0;

        const foodLogs = foodCache[dateStr] || [];
        let cals = 0, pro = 0;
        foodLogs.forEach(i => {
            cals += parseFloat(i.calories) || 0;
            pro += parseFloat(i.protein) || 0;
        });

        return {
            weight: weight,
            cardio: cardio,
            calories: cals,
            protein: pro
        };
    },

    renderChart: function() {
        const timelineDays = parseInt(document.getElementById('select-timeline').value);
        const metric1 = document.getElementById('select-metric-1').value;
        const metric2 = document.getElementById('select-metric-2').value;
        const chartType = document.getElementById('select-chart-type').value;

        // Optimized: Fetch all data ONCE instead of per-date loop
        const dailyCache = Storage.getDailyEntries();
        const foodCache = Storage.getFoodLogs();

        const dates = [];
        const data1 = [];
        const data2 = [];
        
        const baseDate = new Date(App.currentDate);
        
        for (let i = timelineDays - 1; i >= 0; i--) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            
            // Smart labeling: Use DD-MMM for short, MMM-YY for very long
            let label = dateStr.substring(5); // MM-DD
            if (timelineDays > 60) {
                label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            }
            if (timelineDays > 300) {
                label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
            }
            
            dates.push(label);
            
            const agg = this.getAggregateDataForDate(dateStr, dailyCache, foodCache);
            data1.push(agg[metric1]);
            if (metric2 !== 'none') {
                data2.push(agg[metric2]);
            }
        }

        const ctx = document.getElementById('analytics-chart').getContext('2d');
        
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        Chart.defaults.color = '#888888';
        Chart.defaults.font.family = "'Montserrat', sans-serif";

        const datasets = [{
            label: metric1.toUpperCase(),
            data: data1,
            backgroundColor: 'rgba(241, 196, 15, 0.4)', // Yellow
            borderColor: '#f1c40f',
            borderWidth: 2,
            pointRadius: timelineDays > 60 ? 0 : 3, // cleaner lines for long ranges
            tension: 0.3,
            fill: true
        }];

        if (metric2 !== 'none') {
            datasets.push({
                label: metric2.toUpperCase(),
                data: data2,
                backgroundColor: 'rgba(46, 204, 113, 0.3)', // Green
                borderColor: '#2ecc71',
                borderWidth: 2,
                pointRadius: timelineDays > 60 ? 0 : 3,
                tension: 0.3,
                fill: true
            });
        }

        this.chartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: dates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: chartType === 'radar' ? {
                    r: {
                        angleLines: { color: '#333' },
                        grid: { color: '#333' }
                    }
                } : {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#333' },
                        ticks: { color: '#aaa' }
                    },
                    x: {
                        grid: { display: false }, // cleaner X axis
                        ticks: { 
                            color: '#aaa',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 12 // limit labels to keep it tidy
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#fff', boxWidth: 12 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    }
};

// --- Settings & Backup Module ---
const Settings = {
    init: function() {
        // Clear All Data
        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm("Are you sure you want to erase ALL local data? This cannot be undone!")) {
                localStorage.removeItem(Storage.KEYS.DAILY);
                localStorage.removeItem(Storage.KEYS.FOOD);
                localStorage.removeItem(Storage.KEYS.BACKUP_LOGS);
                alert("All data erased.");
                location.reload();
            }
        });

        // Export Header Button
        document.getElementById('btn-export-header').addEventListener('click', () => {
            this.exportExcel();
        });

        // Settings Page Buttons
        document.getElementById('btn-export-excel').addEventListener('click', () => {
            this.exportExcel();
        });

        const importInput = document.getElementById('input-import-file');
        document.getElementById('btn-import-excel').addEventListener('click', () => {
            importInput.click();
        });

        importInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importExcel(e.target.files[0]);
                e.target.value = ''; // reset
            }
        });
    },

    exportExcel: function() {
        // Ensure XLSX is available
        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded properly. Please check your internet connection.');
            return;
        }

        const dailyData = Storage.getDailyEntries();
        const foodData = Storage.getFoodLogs();

        // Prepare Daily Sheet Data
        const dailyRows = [];
        for (const date in dailyData) {
            dailyRows.push({
                Date: date,
                Weight: dailyData[date].weight,
                Workout: dailyData[date].workout,
                Cardio_Calories: dailyData[date].cardio
            });
        }
        
        // Prepare Food Sheet Data
        const foodRows = [];
        for (const date in foodData) {
            foodData[date].forEach(item => {
                foodRows.push({
                    Date: date,
                    Meal: item.mealType,
                    Food: item.name,
                    Weight_g: item.weight,
                    Calories: item.calories,
                    Protein_g: item.protein,
                    Carbs_g: item.carbs,
                    Fat_g: item.fat,
                    Fiber_g: item.fiber
                });
            });
        }

        const wb = XLSX.utils.book_new();
        
        const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
        XLSX.utils.book_append_sheet(wb, wsDaily, "Daily_Overview");
        
        const wsFood = XLSX.utils.json_to_sheet(foodRows);
        XLSX.utils.book_append_sheet(wb, wsFood, "Food_Logs");

        // Generate filename
        const today = new Date().toISOString().split('T')[0];
        const filename = `GymTracker_Backup_${today}.xlsx`;

        XLSX.writeFile(wb, filename);

        // Record backup in internal log (rolling backup logic support)
        let backups = JSON.parse(localStorage.getItem(Storage.KEYS.BACKUP_LOGS) || '[]');
        backups.push({ date: today, filename: filename });
        // Keep last 14 backup records
        if (backups.length > 14) backups.shift();
        localStorage.setItem(Storage.KEYS.BACKUP_LOGS, JSON.stringify(backups));
    },

    importExcel: function(file) {
        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded properly.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                
                // Parse Daily Overview
                if (workbook.SheetNames.includes("Daily_Overview")) {
                    const wsDaily = workbook.Sheets["Daily_Overview"];
                    const dailyJson = XLSX.utils.sheet_to_json(wsDaily);
                    const currentDaily = Storage.getDailyEntries();
                    
                    dailyJson.forEach(row => {
                        if (row.Date) {
                            currentDaily[row.Date] = {
                                weight: row.Weight || '',
                                workout: row.Workout || '',
                                cardio: row.Cardio_Calories || ''
                            };
                        }
                    });
                    localStorage.setItem(Storage.KEYS.DAILY, JSON.stringify(currentDaily));
                }

                // Parse Food Logs
                if (workbook.SheetNames.includes("Food_Logs")) {
                    const wsFood = workbook.Sheets["Food_Logs"];
                    const foodJson = XLSX.utils.sheet_to_json(wsFood);
                    const currentFood = Storage.getFoodLogs();
                    
                    foodJson.forEach(row => {
                        if (row.Date) {
                            if (!currentFood[row.Date]) currentFood[row.Date] = [];
                            
                            // Check for duplicates roughly
                            const exists = currentFood[row.Date].find(i => i.name === row.Food && i.mealType === row.Meal);
                            if (!exists) {
                                currentFood[row.Date].push({
                                    id: Date.now().toString() + Math.random().toString().substring(2, 6),
                                    mealType: row.Meal || '',
                                    name: row.Food || '',
                                    weight: row.Weight_g || 0,
                                    calories: row.Calories || 0,
                                    protein: row.Protein_g || 0,
                                    carbs: row.Carbs_g || 0,
                                    fat: row.Fat_g || 0,
                                    fiber: row.Fiber_g || 0
                                });
                            }
                        }
                    });
                    localStorage.setItem(Storage.KEYS.FOOD, JSON.stringify(currentFood));
                }

                alert("Backup Imported Successfully!");
                location.reload();

            } catch (err) {
                console.error(err);
                alert("Error importing file. Make sure it's a valid GymTracker Excel backup.");
            }
        };
        reader.readAsArrayBuffer(file);
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    FoodTracker.init();
    Analytics.init();
    Settings.init();
});
