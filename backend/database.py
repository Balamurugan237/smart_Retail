import sqlite3
import pandas as pd
import os

DB_PATH = 'backend/smartretail.db'
DATA_DIR = 'backend/data/'

def initialize_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            product_id TEXT PRIMARY KEY,
            product_name TEXT,
            category TEXT,
            price REAL,
            cost_price REAL,
            stock_quantity INTEGER,
            expiry_date TEXT,
            unit TEXT
        )
    ''')

    # 2. customers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            customer_id TEXT PRIMARY KEY,
            customer_name TEXT,
            phone TEXT,
            customer_type TEXT,
            join_date TEXT,
            total_purchases INTEGER,
            city TEXT
        )
    ''')

    # 3. transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            transaction_id TEXT,
            customer_id TEXT,
            transaction_date TEXT,
            product_id TEXT,
            quantity INTEGER,
            unit_price REAL,
            total_amount REAL,
            FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
            FOREIGN KEY (product_id) REFERENCES products(product_id)
        )
    ''')

    # 4. combo_rules table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS combo_rules (
            combo_id TEXT PRIMARY KEY,
            combo_name TEXT,
            product_ids TEXT,
            combo_discount_d2 REAL,
            min_support REAL,
            confidence REAL,
            lift REAL,
            category TEXT
        )
    ''')

    # 5. expiry_predictions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expiry_predictions (
            product_id TEXT PRIMARY KEY,
            product_name TEXT,
            expiry_date TEXT,
            days_until_expiry INTEGER,
            predicted_flag TEXT,
            expiry_discount_d1 REAL,
            suggested_action TEXT,
            FOREIGN KEY (product_id) REFERENCES products(product_id)
        )
    ''')

    # Load data from CSVs
    try:
        if os.path.exists(os.path.join(DATA_DIR, 'products.csv')):
            products_df = pd.read_csv(os.path.join(DATA_DIR, 'products.csv'))
            products_df.to_sql('products', conn, if_exists='replace', index=False)

        if os.path.exists(os.path.join(DATA_DIR, 'customers.csv')):
            customers_df = pd.read_csv(os.path.join(DATA_DIR, 'customers.csv'))
            customers_df.to_sql('customers', conn, if_exists='replace', index=False)

        if os.path.exists(os.path.join(DATA_DIR, 'transactions.csv')):
            transactions_df = pd.read_csv(os.path.join(DATA_DIR, 'transactions.csv'))
            transactions_df.to_sql('transactions', conn, if_exists='replace', index=False)

        if os.path.exists(os.path.join(DATA_DIR, 'combo_rules.csv')):
            combo_rules_df = pd.read_csv(os.path.join(DATA_DIR, 'combo_rules.csv'))
            combo_rules_df.to_sql('combo_rules', conn, if_exists='replace', index=False)

        if os.path.exists(os.path.join(DATA_DIR, 'expiry_predictions.csv')):
            expiry_predictions_df = pd.read_csv(os.path.join(DATA_DIR, 'expiry_predictions.csv'))
            expiry_predictions_df.to_sql('expiry_predictions', conn, if_exists='replace', index=False)

        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error loading CSVs: {e}")
        conn.close()
        return False

if __name__ == '__main__':
    initialize_db()
