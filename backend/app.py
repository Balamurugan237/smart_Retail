from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import pandas as pd
from combo_pricing import get_combos_for_cart, get_expiry_discount, calculate_combo_price
from ml_engine import run_ml_apriori
import os
import csv
import datetime
from database import initialize_db
import threading
import time

# Versioning for real-time sync
data_version = {"timestamp": time.time()}

DB_PATH = 'backend/smartretail.db'
DATA_DIR = 'backend/data/'

def start_csv_watcher():
    def watch():
        global data_version
        last_mtimes = {}
        while True:
            try:
                changed = False
                for filename in os.listdir(DATA_DIR):
                    if filename.endswith('.csv'):
                        path = os.path.join(DATA_DIR, filename)
                        mtime = os.path.getmtime(path)
                        if last_mtimes.get(path) != mtime:
                            if last_mtimes.get(path) is not None:
                                changed = True
                            last_mtimes[path] = mtime
                
                if changed:
                    print("Data change detected in CSVs. Re-initializing database...")
                    if initialize_db():
                        data_version["timestamp"] = time.time()
                        print(f"Database sync complete. New version: {data_version['timestamp']}")
            except Exception as e:
                print(f"Watcher error: {e}")
            
            time.sleep(5) # Poll every 5 seconds

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()

start_csv_watcher()

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# 0. Serve index.html as homepage
@app.route('/')
def index():
    return app.send_static_file('index.html')

# 0.1 Serve cart.html
@app.route('/cart.html')
def cart_page():
    return app.send_static_file('cart.html')

# 0.2 Serve dashboard.html
@app.route('/dashboard.html')
def dashboard_page():
    return app.send_static_file('dashboard.html')

# 0.3 Serve analytics.html
@app.route('/analytics.html')
def analytics_page():
    return app.send_static_file('analytics.html')

# 1. GET /api/products -> all products
@app.route('/api/products', methods=['GET'])
def get_products():
    conn = get_db_connection()
    products = conn.execute("SELECT * FROM products").fetchall()
    conn.close()
    return jsonify([dict(p) for p in products])

# 2. GET /api/products/<id> -> single product
@app.route('/api/products/<product_id>', methods=['GET'])
def get_product(product_id):
    conn = get_db_connection()
    product = conn.execute('SELECT * FROM products WHERE product_id = ?', (product_id,)).fetchone()
    if product:
        # Also include real-time expiry discount
        p_dict = dict(product)
        p_dict['expiry_discount_d1'] = get_expiry_discount(product_id)
        conn.close()
        return jsonify(p_dict)
    conn.close()
    return jsonify({'error': 'Product not found'}), 404

# 3. GET /api/cart/combos?ids=P001,P003 -> combo suggestions for cart
@app.route('/api/cart/combos', methods=['GET'])
def cart_combos():
    ids_str = request.args.get('ids', '')
    if not ids_str:
        return jsonify([])
    
    product_ids = ids_str.split(',')
    suggestions = get_combos_for_cart(product_ids)
    return jsonify(suggestions)

# 4. GET /api/expiry-alerts -> products expiring soon
@app.route('/api/expiry-alerts', methods=['GET'])
def expiry_alerts():
    # We rebuild the alerts based on current date (2025-04-02)
    conn = get_db_connection()
    # Today is 2025-04-02 for this project
    query = """
    SELECT product_id, product_name, expiry_date,
           (julianday(expiry_date) - julianday('2025-04-02')) as days_until_expiry
    FROM products
    WHERE (julianday(expiry_date) - julianday('2025-04-02')) <= 7
    ORDER BY days_until_expiry ASC
    """
    alerts = conn.execute(query).fetchall()
    conn.close()
    
    result = []
    for a in alerts:
        d1 = get_expiry_discount(a['product_id'])
        result.append({
            'product_id': a['product_id'],
            'product_name': a['product_name'],
            'expiry_date': a['expiry_date'],
            'days_until_expiry': int(a['days_until_expiry']),
            'expiry_discount_d1': d1,
            'predicted_flag': 'EXPIRING_SOON' if a['days_until_expiry'] <= 5 else 'WATCH'
        })
    return jsonify(result)

# 5. GET /api/dashboard/stats -> KPI numbers
@app.route('/api/dashboard/stats', methods=['GET'])
def dashboard_stats():
    conn = get_db_connection()
    # Total Sales (Today = 2025-03-31 to 2025-04-02 range in data?)
    # Let's just pick the last few days in the dataset for "Today's" sales
    sales_today = conn.execute("SELECT SUM(total_amount) FROM transactions WHERE transaction_date = '2025-03-14'").fetchone()[0] or 0
    
    # Total unique bills
    total_bills = conn.execute("SELECT COUNT(DISTINCT transaction_id) FROM transactions").fetchone()[0]
    
    # Expiry alerts count
    expiry_count = conn.execute("SELECT COUNT(*) FROM products WHERE (julianday(expiry_date) - julianday('2025-04-02')) <= 5").fetchone()[0]
    
    # Avg margin
    avg_margin = conn.execute("SELECT AVG((price - cost_price) / price * 100) FROM products").fetchone()[0]
    
    # Low combos count
    combos_count = conn.execute("SELECT COUNT(*) FROM combo_rules").fetchone()[0]

    # Low stock count
    low_stock_count = conn.execute("SELECT COUNT(*) FROM products WHERE stock_quantity < 50").fetchone()[0]

    conn.close()
    
    return jsonify({
        'todays_sales': round(sales_today, 2),
        'total_bills': total_bills,
        'expiry_alerts': expiry_count,
        'low_stock_alerts': low_stock_count,
        'avg_profit_margin': round(avg_margin, 2),
        'combos_available': combos_count
    })

# 6. GET /api/dashboard/sales-trend -> weekly/monthly chart data
@app.route('/api/dashboard/sales-trend', methods=['GET'])
def sales_trend():
    conn = get_db_connection()
    query = """
    SELECT transaction_date, SUM(total_amount) as daily_sales
    FROM transactions
    GROUP BY transaction_date
    ORDER BY transaction_date DESC
    LIMIT 15
    """
    trends = conn.execute(query).fetchall()
    conn.close()
    # Reverse to show chronological order in chart
    return jsonify([dict(t) for t in reversed(trends)])

# 7. GET /api/combos -> all combo rules
@app.route('/api/combos', methods=['GET'])
def all_combos():
    conn = get_db_connection()
    combos = conn.execute('SELECT * FROM combo_rules ORDER BY lift DESC').fetchall()
    conn.close()
    return jsonify([dict(c) for c in combos])

# 8. POST /api/ml/run-apriori -> retrain Apriori model
@app.route('/api/ml/run-apriori', methods=['POST'])
def retrain_ml():
    try:
        run_ml_apriori()
        return jsonify({'status': 'success', 'message': 'ML Model retrained and rules updated.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 9. GET /api/customers -> all customers
@app.route('/api/customers', methods=['GET'])
def get_customers():
    conn = get_db_connection()
    customers = conn.execute('SELECT * FROM customers').fetchall()
    conn.close()
    return jsonify([dict(c) for c in customers])

# 10. GET /api/profit/top-products -> highest margin products
@app.route('/api/profit/top-products', methods=['GET'])
def top_products():
    conn = get_db_connection()
    query = """
    SELECT product_id, product_name, price, cost_price, 
           ((price - cost_price) / price * 100) as margin
    FROM products
    ORDER BY margin DESC
    LIMIT 10
    """
    top = conn.execute(query).fetchall()
    conn.close()
    return jsonify([dict(t) for t in top])

# 11. GET /api/dashboard/low-stock -> products with stock < 50
@app.route('/api/dashboard/low-stock', methods=['GET'])
def low_stock_products():
    conn = get_db_connection()
    products = conn.execute("SELECT product_id, product_name, category, stock_quantity, unit FROM products WHERE stock_quantity < 50 ORDER BY stock_quantity ASC").fetchall()
    conn.close()
    return jsonify([dict(p) for p in products])

# 12. GET /api/dashboard/smart-restock -> predictive restock suggestions
@app.route('/api/dashboard/smart-restock', methods=['GET'])
def smart_restock():
    conn = get_db_connection()
    products = conn.execute("SELECT product_id, product_name, category, stock_quantity, unit FROM products WHERE stock_quantity < 50").fetchall()
    conn.close()
    
    suggestions = []
    for p in products:
        current = p['stock_quantity']
        suggested = 150 - current
        priority = "CRITICAL" if current < 25 else "WARNING"
        suggestions.append({
            'product_id': p['product_id'],
            'product_name': p['product_name'],
            'category': p['category'],
            'current_stock': current,
            'suggested_restock': suggested,
            'unit': p['unit'],
            'priority': priority
        })
    return jsonify(suggestions)

# 13. GET /api/analytics/product-sales -> Top 10 products by revenue
@app.route('/api/analytics/product-sales', methods=['GET'])
def product_sales_analytics():
    conn = get_db_connection()
    query = """
    SELECT p.product_name, SUM(t.total_amount) as revenue
    FROM transactions t
    JOIN products p ON t.product_id = p.product_id
    GROUP BY p.product_id
    ORDER BY revenue DESC
    LIMIT 10
    """
    data = conn.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in data])

# 14. GET /api/analytics/monthly-sales -> Sales trend by month
@app.route('/api/analytics/monthly-sales', methods=['GET'])
def monthly_sales_analytics():
    conn = get_db_connection()
    query = """
    SELECT strftime('%Y-%m', transaction_date) as month, SUM(total_amount) as revenue
    FROM transactions
    GROUP BY month
    ORDER BY month ASC
    """
    data = conn.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in data])

# 14.1 GET /api/analytics/trending -> Top 5 popular products
@app.route('/api/analytics/trending', methods=['GET'])
def trending_products():
    conn = get_db_connection()
    query = """
    SELECT p.product_id, p.product_name, p.category, SUM(t.quantity) as total_qty
    FROM transactions t
    JOIN products p ON t.product_id = p.product_id
    GROUP BY p.product_id
    ORDER BY total_qty DESC
    LIMIT 5
    """
    data = conn.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in data])

# 14.2 GET /api/dashboard/profit-optimization -> High margin items with low sales
@app.route('/api/dashboard/profit-optimization', methods=['GET'])
def profit_optimization():
    conn = get_db_connection()
    # High margin = > 20%, Low sales = < 10 units total (in sample data)
    query = """
    SELECT p.product_id, p.product_name, p.category, p.price, 
           ((p.price - p.cost_price) / p.price * 100) as margin,
           COALESCE(SUM(t.quantity), 0) as total_sold
    FROM products p
    LEFT JOIN transactions t ON p.product_id = t.product_id
    GROUP BY p.product_id
    HAVING margin > 20 AND total_sold < 15
    ORDER BY margin DESC
    LIMIT 5
    """
    data = conn.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in data])

# 14.3 GET /api/system/version -> Current data version for polling
@app.route('/api/system/version', methods=['GET'])
def get_system_version():
    return jsonify(data_version)

# --- Order & Sync Logic ---

def sync_transaction_to_csv(transaction_data):
    csv_file = os.path.join(DATA_DIR, 'transactions.csv')
    with open(csv_file, mode='a', newline='') as f:
        writer = csv.writer(f)
        for row in transaction_data:
            writer.writerow(row)

def update_products_csv():
    # Sync entire products table back to CSV to keep stock updated
    conn = get_db_connection()
    df = pd.read_sql("SELECT * FROM products", conn)
    conn.close()
    csv_file = os.path.join(DATA_DIR, 'products.csv')
    df.to_csv(csv_file, index=False)

# 15. POST /api/order -> Process new order from customer
@app.route('/api/order', methods=['POST'])
def place_order():
    data = request.json
    cart_items = data.get('cart', [])
    customer_id = data.get('customer_id', 'C001') # Default for demo
    
    if not cart_items:
        return jsonify({'status': 'error', 'message': 'Cart is empty'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Generate Transaction ID
    res = cursor.execute("SELECT COUNT(DISTINCT transaction_id) FROM transactions").fetchone()
    transaction_id = f"T{res[0] + 1:04d}"
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    
    try:
        csv_rows = []
        for item in cart_items:
            pid = item['id']
            qty = int(item['qty'])
            price = float(item['price'])
            total = round(qty * price, 2)
            
            # 1. DB: Insert Transaction
            cursor.execute("""
                INSERT INTO transactions (transaction_id, customer_id, transaction_date, product_id, quantity, unit_price, total_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (transaction_id, customer_id, today, pid, qty, price, total))
            
            # 2. DB: Deduct Stock
            cursor.execute("UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?", (qty, pid))
            
            # Prepare CSV row
            csv_rows.append([transaction_id, customer_id, today, pid, qty, price, total])
            
        conn.commit()
        
        # 3. CSV: Sync Transactions (Append)
        sync_transaction_to_csv(csv_rows)
        
        # 4. CSV: Sync Products (Overwrite with updated stock)
        update_products_csv()
        
    except Exception as e:
        conn.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        conn.close()
        
    return jsonify({
        'status': 'success', 
        'message': 'Order placed successfully! Check the dashboard to see the update.',
        'transaction_id': transaction_id,
        'order_details': csv_rows
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
