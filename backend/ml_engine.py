import sqlite3
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
import os
import warnings

# Suppress deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Database Path
DB_PATH = 'backend/smartretail.db'

def run_ml_apriori():
    """
    Load transactions, run Apriori, and save association rules to database.
    """
    print("--- Starting Apriori ML Engine ---")

    # 1. Connect to Database
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file '{DB_PATH}' not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    
    # 2. Load Transactions
    query = "SELECT transaction_id, product_id FROM transactions"
    df = pd.read_sql(query, conn)
    
    if df.empty:
        print("Error: No transaction data found in database.")
        conn.close()
        return

    print(f"Loaded {len(df)} transaction records.")

    # 3. Create Basket Format (Transaction-Product Matrix)
    # Group by transaction_id and get counts of product_id
    basket = df.groupby(['transaction_id', 'product_id']).size().unstack(fill_value=0)

    # Convert to boolean (True if product exists in transaction, False otherwise)
    # Using > 0 is robust across pandas versions
    basket_sets = basket.map(lambda x: x > 0)
    print(f"Basket matrix shape: {basket_sets.shape}")

    # 4. Run Apriori Algorithm
    # min_support = 0.05 as per requirement
    print("Running Apriori algorithm (min_support=0.05)...")
    frequent_itemsets = apriori(basket_sets, min_support=0.05, use_colnames=True)
    
    if frequent_itemsets.empty:
        print("No frequent itemsets found with min_support=0.05")
        conn.close()
        return

    # 5. Generate Association Rules
    # min_confidence = 0.3 as per requirement
    print("Generating association rules (min_confidence=0.3)...")
    try:
        rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=0.3)
    except Exception as e:
        print(f"Error generating association rules: {e}")
        # Fallback if association_rules fails due to version issues
        conn.close()
        return

    if rules.empty:
        print("No association rules found with min_confidence=0.3")
        conn.close()
        return

    # Sort by lift score
    rules = rules.sort_values('lift', ascending=False)
    
    # 6. Save Top Rules to combo_rules table
    print(f"Found {len(rules)} rules. Saving top rules to 'combo_rules' table...")
    
    cursor = conn.cursor()
    cursor.execute("DELETE FROM combo_rules")
    
    # Get product names and categories for mapping
    products_query = "SELECT product_id, product_name, category FROM products"
    products_df = pd.read_sql(products_query, conn)
    product_map = dict(zip(products_df.product_id, products_df.product_name))
    category_map = dict(zip(products_df.product_id, products_df.category))

    new_rules_data = []
    top_rules = rules.head(20)  # Save top 20 rules
    
    for idx, row in top_rules.iterrows():
        # antecedents and consequents are frozensets
        antecedents = list(row['antecedents'])
        consequents = list(row['consequents'])
        all_products = antecedents + consequents
        
        combo_id = f"CB_ML_{idx+1:03d}"
        combo_name = " + ".join([product_map.get(str(p), str(p)) for p in all_products])
        product_ids = "|".join([str(p) for p in all_products])
        
        # Calculate D2 discount (6% to 10% based on lift)
        # Using a safer mapping for lift
        lift = row['lift']
        # If lift is NaN or Inf, default to 1.0
        if pd.isna(lift) or lift == float('inf'):
            lift = 1.0
            
        d2_discount = min(0.10, max(0.06, 0.06 + (lift - 1) * 0.01))
        
        # Derive combo category
        categories = list(set([category_map.get(str(p), 'General') for p in all_products]))
        combo_category = "-".join(categories)

        new_rules_data.append((
            combo_id,
            combo_name,
            product_ids,
            round(float(d2_discount), 3),
            round(float(row['support']), 3),
            round(float(row['confidence']), 3),
            round(float(row['lift']), 3),
            combo_category
        ))

    # Insert into database
    cursor.executemany('''
        INSERT INTO combo_rules (combo_id, combo_name, product_ids, combo_discount_d2, min_support, confidence, lift, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', new_rules_data)

    conn.commit()
    conn.close()
    
    print("\n--- Top 10 Rules Found ---")
    for r in new_rules_data[:10]:
        print(f"Combo: {r[1]} | Lift: {r[6]} | Discount: {int(r[3]*100)}%")
    
    print("\nML Engine finished successfully.")

if __name__ == '__main__':
    run_ml_apriori()
