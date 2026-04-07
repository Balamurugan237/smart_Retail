import sqlite3
from datetime import datetime
import os

DB_PATH = 'backend/smartretail.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_expiry_discount(product_id):
    """
    Calculate Expiry Discount (D1) based on days left until expiry.
    - <= 2 days -> 0.20
    - <= 3 days -> 0.15
    - <= 5 days -> 0.10
    - <= 7 days -> 0.05
    - > 7 days -> 0.00
    """
    conn = get_db_connection()
    product = conn.execute('SELECT expiry_date FROM products WHERE product_id = ?', (product_id,)).fetchone()
    conn.close()

    if not product or not product['expiry_date']:
        return 0.0

    try:
        expiry_date = datetime.strptime(product['expiry_date'], '%Y-%m-%d')
        # Using 2025-04-02 as 'today' to align with the dataset's expiry dates
        today = datetime(2025, 4, 2)
        days_left = (expiry_date - today).days

        if days_left <= 2:
            return 0.20
        elif days_left <= 3:
            return 0.15
        elif days_left <= 5:
            return 0.10
        elif days_left <= 7:
            return 0.05
        else:
            return 0.0
    except Exception as e:
        print(f"Error calculating expiry discount for {product_id}: {e}")
        return 0.0

def get_combo_discount(combo_id):
    """
    Get Combo Discount (D2) from combo_rules table.
    """
    conn = get_db_connection()
    rule = conn.execute('SELECT combo_discount_d2 FROM combo_rules WHERE combo_id = ?', (combo_id,)).fetchone()
    conn.close()

    if rule:
        return float(rule['combo_discount_d2'])
    return 0.0

def calculate_combo_price(product_ids):
    """
    Calculate final combo price using formula: Total Price * (1 - D1 - D2)
    product_ids: list of product IDs in the combo
    """
    conn = get_db_connection()
    
    total_original_price = 0.0
    max_d1 = 0.0 # We take the maximum D1 (most urgent expiry) among products in combo
    # Or should it be applied per product? 
    # Usually, combo discount is on the total. 
    # The requirement says: Combo Price = Total Price × (1 - D1 - D2)
    # This implies D1 and D2 apply to the entire total.
    
    products_data = []
    for pid in product_ids:
        p = conn.execute('SELECT product_name, price FROM products WHERE product_id = ?', (pid,)).fetchone()
        if p:
            total_original_price += p['price']
            d1 = get_expiry_discount(pid)
            max_d1 = max(max_d1, d1)
            products_data.append({
                'id': pid,
                'name': p['product_name'],
                'price': p['price'],
                'd1': d1
            })
    
    conn.close()
    
    # We need a combo_id to get D2. If this is a dynamic combo from cart, 
    # we should check if it matches any rule.
    # For now, let's assume we are checking against existing rules.
    d2 = 0.0
    matched_combo = get_matching_rules(product_ids)
    if matched_combo:
        d2 = matched_combo[0]['combo_discount_d2']
        combo_name = matched_combo[0]['combo_name']
    else:
        combo_name = "Custom Selection"

    final_price = total_original_price * (1 - max_d1 - d2)
    
    return {
        'original_price': total_original_price,
        'd1': max_d1,
        'd2': d2,
        'final_price': round(final_price, 2),
        'savings': round(total_original_price - final_price, 2),
        'combo_name': combo_name,
        'products': products_data
    }

def get_matching_rules(selected_product_ids):
    """
    Check if the selected products match any combo rule.
    """
    conn = get_db_connection()
    rules = conn.execute('SELECT * FROM combo_rules').fetchall()
    conn.close()
    
    selected_set = set(selected_product_ids)
    matches = []
    
    for rule in rules:
        rule_pids = set(rule['product_ids'].split('|'))
        # If the selected products contain all products of a rule, it's a match
        if rule_pids.issubset(selected_set):
            matches.append(dict(rule))
            
    # Sort matches by lift or discount
    return sorted(matches, key=lambda x: x['lift'], reverse=True)

def get_combos_for_cart(cart_product_ids):
    """
    Find combo suggestions based on products currently in the cart.
    If cart has P001, suggest combos that include P001.
    """
    if not cart_product_ids:
        return []

    conn = get_db_connection()
    rules = conn.execute('SELECT * FROM combo_rules').fetchall()
    
    suggestions = []
    cart_set = set(cart_product_ids)
    
    for rule in rules:
        rule_pids = set(rule['product_ids'].split('|'))
        
        # Intersection: products already in cart that are part of this combo
        intersection = rule_pids.intersection(cart_set)
        
        # If at least one product is in cart, but the whole combo is not yet complete
        if intersection and not rule_pids.issubset(cart_set):
            # Missing products to complete the combo
            missing_pids = rule_pids - cart_set
            
            # Get details for missing products
            missing_details = []
            for m_pid in missing_pids:
                p = conn.execute('SELECT product_name, price FROM products WHERE product_id = ?', (m_pid,)).fetchone()
                if p:
                    missing_details.append({'id': m_pid, 'name': p['product_name'], 'price': p['price']})
            
            # Calculate what the price would be if they add the missing ones
            all_pids = list(rule_pids)
            pricing = calculate_combo_price(all_pids)
            
            suggestions.append({
                'combo_id': rule['combo_id'],
                'combo_name': rule['combo_name'],
                'missing_products': missing_details,
                'combo_discount_d2': rule['combo_discount_d2'],
                'final_combo_price': pricing['final_price'],
                'original_total': pricing['original_price'],
                'savings': pricing['savings'],
                'd1': pricing['d1']
            })
            
    conn.close()
    # Sort suggestions by savings or lift
    return sorted(suggestions, key=lambda x: x['savings'], reverse=True)[:5]

if __name__ == '__main__':
    # Test cases
    print("Testing get_expiry_discount for P004 (2025-04-07 vs 2026-04-02):", get_expiry_discount('P004'))
    print("Testing combo suggestion for cart with P001:", get_combos_for_cart(['P001']))
