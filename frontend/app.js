const API_BASE = 'http://127.0.0.1:5000/api';

// --- Dashboard Logic ---

async function initDashboard() {
    try {
        await Promise.all([
            fetchStats(),
            fetchExpiryAlerts()
        ]);
    } catch (error) {
        console.error("Dashboard Init Error:", error);
    }
}

async function fetchStats() {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    const data = await res.json();
    
    document.getElementById('todaySales').textContent = `₹${data.todays_sales.toLocaleString()}`;
    document.getElementById('expiryAlerts').textContent = data.expiry_alerts;
    document.getElementById('avgMargin').textContent = `${data.avg_profit_margin}%`;
    document.getElementById('combosCount').textContent = data.combos_available;
    document.getElementById('lowStockCount').textContent = data.low_stock_alerts;
}

async function fetchExpiryAlerts() {
    const res = await fetch(`${API_BASE}/expiry-alerts`);
    const data = await res.json();
    const list = document.getElementById('alertsList');
    list.innerHTML = '';
    
    if (data.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted)">No critical alerts today.</p>`;
        return;
    }

    data.forEach(alert => {
        const div = document.createElement('div');
        div.className = `alert-item ${alert.days_until_expiry <= 2 ? 'urgent' : ''}`;
        div.innerHTML = `
            <div class="alert-info">
                <h4>${alert.product_name}</h4>
                <p>Expires in ${alert.days_until_expiry} days (${alert.expiry_date})</p>
            </div>
            <div class="alert-discount">
                -${(alert.expiry_discount_d1 * 100).toFixed(0)}% OFF
            </div>
        `;
        list.appendChild(div);
    });
}

// --- Combo Details Modal ---

async function showComboDetails() {
    const modal = document.getElementById('comboModal');
    const container = document.getElementById('comboDetailsList');
    
    modal.style.display = 'flex';
    container.innerHTML = '<p style="color: var(--text-muted)">Fetching all combo deals...</p>';

    try {
        const res = await fetch(`${API_BASE}/combos`);
        const combos = await res.json();
        
        container.innerHTML = '';
        combos.forEach(combo => {
            const div = document.createElement('div');
            div.className = 'combo-detail-item';
            div.innerHTML = `
                <div class="combo-info-left">
                    <h4>${combo.combo_name}</h4>
                    <p>${combo.category}</p>
                </div>
                <div class="combo-info-right">
                    <span class="combo-stat" style="color: var(--success); font-size: 1.1rem">${(combo.combo_discount_d2 * 100).toFixed(0)}% OFF</span>
                    <span class="combo-stat">Lift: ${combo.lift}</span>
                    <span class="combo-stat">Conf: ${(combo.confidence * 100).toFixed(0)}%</span>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        container.innerHTML = '<p style="color: var(--danger)">Failed to load combo details.</p>';
    }
}

function closeComboModal() {
    document.getElementById('comboModal').style.display = 'none';
}

// --- Expiry Details Modal ---

async function showExpiryDetails() {
    const modal = document.getElementById('expiryModal');
    const container = document.getElementById('expiryDetailsList');
    
    modal.style.display = 'flex';
    container.innerHTML = '<p style="color: var(--text-muted)">Fetching expiry details...</p>';

    try {
        const res = await fetch(`${API_BASE}/expiry-alerts`);
        const alerts = await res.json();
        
        container.innerHTML = '';
        if (alerts.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted)">No critical expiry alerts currently.</p>';
            return;
        }

        alerts.forEach(alert => {
            const div = document.createElement('div');
            div.className = 'combo-detail-item'; // Reuse styling
            div.style.borderLeft = alert.days_until_expiry <= 2 ? '4px solid var(--danger)' : '4px solid var(--primary)';
            div.innerHTML = `
                <div class="combo-info-left">
                    <h4>${alert.product_name}</h4>
                    <p>Expires: ${alert.expiry_date} (${alert.days_until_expiry} days left)</p>
                </div>
                <div class="combo-info-right">
                    <span class="combo-stat" style="color: var(--danger); font-size: 1.1rem">-${(alert.expiry_discount_d1 * 100).toFixed(0)}% OFF</span>
                    <span class="combo-stat">Ref: ${alert.product_id}</span>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        container.innerHTML = '<p style="color: var(--danger)">Failed to load expiry details.</p>';
    }
}

function closeExpiryModal() {
    document.getElementById('expiryModal').style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const comboModal = document.getElementById('comboModal');
    const expiryModal = document.getElementById('expiryModal');
    if (event.target == comboModal) {
        comboModal.style.display = 'none';
    }
    if (event.target == expiryModal) {
        expiryModal.style.display = 'none';
    }
    const lowStockModal = document.getElementById('lowStockModal');
    if (event.target == lowStockModal) {
        lowStockModal.style.display = 'none';
    }
}

// --- Low Stock & Restock Modal ---

async function showLowStockDetails() {
    const modal = document.getElementById('lowStockModal');
    const container = document.getElementById('lowStockDetailsList');
    
    modal.style.display = 'flex';
    container.innerHTML = '<p style="color: var(--text-muted)">Analyzing inventory levels...</p>';

    try {
        const res = await fetch(`${API_BASE}/dashboard/smart-restock`);
        const suggestions = await res.json();
        
        container.innerHTML = '';
        if (suggestions.length === 0) {
            container.innerHTML = '<p style="color: var(--success)">All stock levels are healthy.</p>';
            return;
        }

        suggestions.forEach(item => {
            const div = document.createElement('div');
            div.className = 'combo-detail-item';
            div.style.borderLeft = item.priority === 'CRITICAL' ? '4px solid var(--danger)' : '4px solid var(--warning)';
            div.innerHTML = `
                <div class="combo-info-left">
                    <div style="display: flex; align-items: center; gap: 0.5rem">
                        <h4>${item.product_name}</h4>
                        <span class="badge ${item.priority.toLowerCase()}">${item.priority}</span>
                    </div>
                    <p>${item.category} • Current: ${item.current_stock} ${item.unit}</p>
                </div>
                <div class="combo-info-right">
                    <span style="color: var(--accent); font-weight: 700">+${item.suggested_restock} REFILL</span>
                    <span class="combo-stat">Ref: ${item.product_id}</span>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        container.innerHTML = '<p style="color: var(--danger)">Failed to load inventory insights.</p>';
    }
}

function closeLowStockModal() {
    document.getElementById('lowStockModal').style.display = 'none';
}

async function retrainML() {
    const btn = event.target;
    const oldText = btn.textContent;
    btn.textContent = 'Retraining...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/ml/run-apriori`, { method: 'POST' });
        const data = await res.json();
        alert(data.message);
        window.location.reload();
    } catch (error) {
        alert("Failed to retrain model.");
    } finally {
        btn.textContent = oldText;
        btn.disabled = false;
    }
}

// --- Cart Logic ---

async function initCart() {
    await fetchProducts();
    updateCartUI();
}

async function fetchProducts() {
    const res = await fetch(`${API_BASE}/products`);
    const data = await res.json();
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    grid.innerHTML = '';
    data.forEach(p => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div>
                <span class="product-cat">${p.category}</span>
                <h3 class="product-name">${p.product_name}</h3>
            </div>
            <div class="product-footer">
                <span class="product-price">₹${p.price}</span>
                <button class="add-btn" onclick="addToCart('${p.product_id}', '${p.product_name}', ${p.price})">+</button>
            </div>
        `;
        grid.appendChild(div);
    });
}

let cart = [];

function addToCart(pid, name, price) {
    const existing = cart.find(i => i.id === pid);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id: pid, name: name, price: price, qty: 1 });
    }
    updateCartUI();
    fetchComboSuggestions();
}

async function updateCartUI() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem">Your cart is empty.</p>';
        document.getElementById('subtotal').textContent = '₹0.00';
        document.getElementById('totalDiscount').textContent = '- ₹0.00';
        document.getElementById('finalTotal').textContent = '₹0.00';
        return;
    }

    container.innerHTML = '';
    let subtotal = 0;

    cart.forEach(item => {
        subtotal += item.price * item.qty;
        const div = document.createElement('div');
        div.style.marginBottom = '1rem';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center">
                <span style="font-size: 0.9rem">${item.name} x ${item.qty}</span>
                <span style="font-weight: 600">₹${(item.price * item.qty).toFixed(2)}</span>
            </div>
        `;
        container.appendChild(div);
    });

    document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    
    // Default values until combo/expiry is calculated
    document.getElementById('totalDiscount').textContent = '- ₹0.00';
    document.getElementById('finalTotal').textContent = `₹${subtotal.toFixed(2)}`;
}

async function fetchComboSuggestions() {
    if (cart.length === 0) return;
    
    const ids = cart.map(i => i.id).join(',');
    const res = await fetch(`${API_BASE}/cart/combos?ids=${ids}`);
    const data = await res.json();
    
    const container = document.getElementById('comboSuggestions');
    if (!container) return;

    container.innerHTML = '';
    
    // We check if any combo is ALREADY complete in the cart to apply discounts
    // The API /api/cart/combos returns suggestions (incomplete combos)
    // To handle applied discounts, we might need a separate endpoint or logic
    // Let's assume the first suggestion is the best way to save.
    
    if (data.length > 0) {
        const suggestion = data[0];
        const div = document.createElement('div');
        div.className = 'combo-card';
        div.innerHTML = `
            <span class="combo-badge">COMBO SAVER</span>
            <h4 style="margin-bottom: 0.5rem">${suggestion.combo_name}</h4>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem">
                Add: ${suggestion.missing_products.map(p => p.name).join(', ')}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center">
                <div>
                    <span style="text-decoration: line-through; font-size: 0.8rem; color: var(--text-muted)">₹${suggestion.original_total}</span>
                    <span style="font-weight: 800; color: var(--accent); font-size: 1.1rem">₹${suggestion.final_combo_price}</span>
                </div>
                <button class="add-btn" style="width: auto; height: auto; padding: 0.3rem 0.8rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700" 
                    onclick="addComboToCart('${suggestion.combo_id}')">ADD COMBO</button>
            </div>
        `;
        container.appendChild(div);
    }
    
    // If a combo is complete, we should show the savings in the total
    // Let's refine the pricing logic on the frontend based on the cart
    updateFinalPricing();
}

async function updateFinalPricing() {
    if (cart.length === 0) return;
    
    // For simplicity, we fetch the "combo price" for the entire cart
    const ids = cart.flatMap(item => Array(item.qty).fill(item.id)).join(',');
    // Wait, use a simplified approach: just use the sum of individual prices - max combo discount
    // Actually, let's just use the subtotal as a base
    let subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    
    // Call a backend helper if needed, but for now let's just mock the discount display
    // based on the top combo suggestion's D2 if it were to be applied.
    // If no combo is complete, we check for D1 (expiry) only.
    
    let totalD1 = 0;
    for (const item of cart) {
        const res = await fetch(`${API_BASE}/products/${item.id}`);
        const pData = await res.json();
        if (pData.expiry_discount_d1 > 0) {
            totalD1 += (item.price * item.qty * pData.expiry_discount_d1);
        }
    }
    
    document.getElementById('totalDiscount').textContent = `- ₹${totalD1.toFixed(2)}`;
    document.getElementById('finalTotal').textContent = `₹${(subtotal - totalD1).toFixed(2)}`;
}

async function addComboToCart(comboId) {
    const idsInCart = cart.map(i => i.id).join(',');
    const res = await fetch(`${API_BASE}/cart/combos?ids=${idsInCart}`);
    const data = await res.json();
    const combo = data.find(c => c.combo_id === comboId);
    
    if (combo) {
        for (const p of combo.missing_products) {
            addToCart(p.id, p.name, p.price);
        }
    }
}

// --- Advanced Storefront Logic ---

let allProducts = [];
let currentCategory = 'All';

async function initStorefront() {
    try {
        const res = await fetch(`${API_BASE}/products`);
        allProducts = await res.json();
        
        renderCategoryTabs();
        renderStoreProducts();
        updateStoreCartUI();
    } catch (error) {
        console.error("Storefront Init Error:", error);
    }
}

function renderCategoryTabs() {
    const tabsContainer = document.getElementById('categoryTabs');
    if (!tabsContainer) return;
    
    const categories = ['All', ...new Set(allProducts.map(p => p.category))];
    tabsContainer.innerHTML = '';
    
    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = `cat-tab ${currentCategory === cat ? 'active' : ''}`;
        div.textContent = cat;
        div.onclick = () => {
            currentCategory = cat;
            renderCategoryTabs();
            renderStoreProducts();
        };
        tabsContainer.appendChild(div);
    });
}

function renderStoreProducts() {
    const grid = document.getElementById('storeProductGrid');
    if (!grid) return;
    
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    
    const filtered = allProducts.filter(p => {
        const matchesCat = currentCategory === 'All' || p.category === currentCategory;
        const matchesSearch = p.product_name.toLowerCase().includes(searchTerm) || 
                              p.category.toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });
    
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted)">No products found matching your criteria.</div>`;
        return;
    }

    filtered.forEach(async p => {
        const div = document.createElement('div');
        div.className = 'advanced-product-card';
        
        // Stock status
        const isLow = p.stock_quantity < 50;
        const stockHtml = `
            <div class="stock-indicator">
                <span class="stock-dot ${isLow ? 'low-stock' : 'in-stock'}"></span>
                <span>${isLow ? 'Low Stock' : 'In Stock'} (${p.stock_quantity} ${p.unit})</span>
            </div>
        `;

        // Get Diversified Image (ignoring weight/units)
        const imgUrl = await ImageService.fetchProductImage(p.product_name, p.product_id);

        div.innerHTML = `
            <div class="product-info-top">
                <div>
                    <span class="product-cat">${p.category}</span>
                    <h3 class="product-name" style="margin-top: 0.25rem">${p.product_name}</h3>
                </div>
                ${stockHtml}
            </div>
            <div class="product-img-container skeleton">
                <img src="${imgUrl}" alt="${p.product_name}" class="product-img" onload="this.parentElement.classList.remove('skeleton')">
            </div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto">
                <div>
                    <span style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem">Price</span>
                    <span class="price-tag">₹${p.price}</span>
                </div>
                <button class="add-to-cart-btn" style="width: auto; padding: 0.6rem 1.2rem" onclick="addToStoreCart('${p.product_id}', '${p.product_name}', ${p.price})">
                    <span>Add to Cart</span>
                </button>
            </div>
        `;
        grid.appendChild(div);
    });
}

function filterProductsStore() {
    renderStoreProducts();
}

function addToStoreCart(pid, name, price) {
    const existing = cart.find(i => i.id === pid);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id: pid, name: name, price: price, qty: 1 });
    }
    updateStoreCartUI();
    fetchStoreComboSuggestions();
}

async function updateStoreCartUI() {
    const list = document.getElementById('cartItemsList');
    const badge = document.getElementById('cartCountBadge');
    if (!list) return;

    const totalQty = cart.reduce((acc, i) => acc + i.qty, 0);
    badge.textContent = totalQty;

    if (cart.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 3rem">
                <div style="font-size: 2.5rem; margin-bottom: 1rem">🛒</div>
                <p>Your cart is empty.</p>
            </div>
        `;
        document.getElementById('storeSubtotal').textContent = '₹0.00';
        document.getElementById('storeDiscount').textContent = '- ₹0.00';
        document.getElementById('storeFinalTotal').textContent = '₹0.00';
        return;
    }

    list.innerHTML = '';
    let subtotal = 0;

    cart.forEach((item, index) => {
        subtotal += item.price * item.qty;
        const div = document.createElement('div');
        div.style.background = 'rgba(255,255,255,0.03)';
        div.style.padding = '0.75rem';
        div.style.borderRadius = '0.75rem';
        div.style.marginBottom = '0.75rem';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.innerHTML = `
            <div>
                <div style="font-size: 0.9rem; font-weight: 600">${item.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted)">₹${item.price} x ${item.qty}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem">
                <span style="font-weight: 700">₹${(item.price * item.qty).toFixed(2)}</span>
                <button onclick="removeFromStoreCart(${index})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1rem">×</button>
            </div>
        `;
        list.appendChild(div);
    });

    document.getElementById('storeSubtotal').textContent = `₹${subtotal.toFixed(2)}`;
    updateStoreFinalPricing();
}

function removeFromStoreCart(index) {
    cart.splice(index, 1);
    updateStoreCartUI();
    fetchStoreComboSuggestions();
}

async function fetchStoreComboSuggestions() {
    if (cart.length === 0) {
        const container = document.getElementById('storeSuggestions');
        if (container) container.innerHTML = '';
        return;
    }
    
    const ids = cart.map(i => i.id).join(',');
    const res = await fetch(`${API_BASE}/cart/combos?ids=${ids}`);
    const data = await res.json();
    
    const container = document.getElementById('storeSuggestions');
    if (!container) return;
    container.innerHTML = '';
    
    if (data.length > 0) {
        const suggestion = data[0];
        const div = document.createElement('div');
        div.className = 'combo-card';
        div.innerHTML = `
            <span class="combo-badge">AI COMBO OFFER</span>
            <h4 style="margin-bottom: 0.25rem">${suggestion.combo_name}</h4>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem">
                Complete this set to save <span style="color: var(--accent); font-weight: 800">₹${(suggestion.original_total - suggestion.final_combo_price).toFixed(2)}</span>
            </p>
            <button class="add-to-cart-btn" style="width: auto; padding: 0.4rem 0.8rem; font-size: 0.75rem" 
                onclick="addStoreComboToCart('${suggestion.combo_id}')">Add Missing Items</button>
        `;
        container.appendChild(div);
    }
}

async function updateStoreFinalPricing() {
    if (cart.length === 0) return;
    let subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    
    let totalD1 = 0;
    for (const item of cart) {
        const res = await fetch(`${API_BASE}/products/${item.id}`);
        const pData = await res.json();
        if (pData.expiry_discount_d1 > 0) {
            totalD1 += (item.price * item.qty * pData.expiry_discount_d1);
        }
    }
    
    document.getElementById('storeDiscount').textContent = `- ₹${totalD1.toFixed(2)}`;
    document.getElementById('storeFinalTotal').textContent = `₹${(subtotal - totalD1).toFixed(2)}`;
}

async function processCheckout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const btn = document.getElementById('checkoutBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Processing...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_id: 'C001', 
                cart: cart
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showSuccessOverlay(data.transaction_id, data.order_details);
            cart = [];
        } else {
            alert("Order failed: " + data.message);
        }
    } catch (error) {
        alert("Server error during checkout.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function showSuccessOverlay(orderId, details) {
    const overlay = document.getElementById('successOverlay');
    document.getElementById('successOrderId').textContent = orderId;
    
    // Render Summary Table
    const tableContainer = document.getElementById('orderSummaryTable');
    if (tableContainer && details) {
        let html = `
            <table style="width: 100%; color: white; border-collapse: collapse; text-align: left; font-size: 0.9rem">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1)">
                        <th style="padding: 1rem 0">Product ID</th>
                        <th style="padding: 1rem 0">Qty</th>
                        <th style="padding: 1rem 0">Price</th>
                        <th style="padding: 1rem 0">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        details.forEach(row => {
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">
                    <td style="padding: 0.75rem 0; color: var(--accent)">${row[3]}</td>
                    <td style="padding: 0.75rem 0">${row[4]}</td>
                    <td style="padding: 0.75rem 0">₹${row[5]}</td>
                    <td style="padding: 0.75rem 0; font-weight: 700">₹${row[6]}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        tableContainer.innerHTML = html;
    }
    
    overlay.style.display = 'flex';
    
    let seconds = 15; // Increased for user to read details
    const counter = document.getElementById('countdown');
    const interval = setInterval(() => {
        seconds--;
        counter.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(interval);
            location.reload();
        }
    }, 1000);
}

async function addStoreComboToCart(comboId) {
    const idsInCart = cart.map(i => i.id).join(',');
    const res = await fetch(`${API_BASE}/cart/combos?ids=${idsInCart}`);
    const data = await res.json();
    const combo = data.find(c => c.combo_id === comboId);
    
    if (combo) {
        for (const p of combo.missing_products) {
            addToStoreCart(p.id, p.name, p.price);
        }
    }
}
// --- Real-time Sync Listener ---
window.addEventListener('smartRetailDataUpdated', async (event) => {
    console.log('🔔 UI Update Triggered by Real-time Pipeline');
    
    // Check which page we are on and refresh appropriately
    const path = window.location.pathname;
    
    if (path.includes('cart.html')) {
        await initStorefront();
    } else if (path.includes('dashboard.html')) {
        await initDashboard();
    }
});
