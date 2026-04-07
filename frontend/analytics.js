const API_BASE = 'http://127.0.0.1:5000/api';

// Set up Chart.js defaults for modern styling
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Outfit', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(148, 163, 184, 0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        initProductSalesChart(),
        initMonthlySalesChart()
    ]);
});

async function initProductSalesChart() {
    try {
        const res = await fetch(`${API_BASE}/analytics/product-sales`);
        const data = await res.json();

        const ctx = document.getElementById('productSalesChart').getContext('2d');
        const labels = data.map(item => item.product_name);
        const revenue = data.map(item => item.revenue);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Revenue (₹)',
                    data: revenue,
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 8,
                    hoverBackgroundColor: 'rgba(168, 85, 247, 0.8)',
                    hoverBorderColor: '#a855f7'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Horizontal bars
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(148, 163, 184, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: '#f8fafc',
                            font: { weight: '600' }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Product Sales Chart Error:", error);
    }
}

async function initMonthlySalesChart() {
    try {
        const res = await fetch(`${API_BASE}/analytics/monthly-sales`);
        const data = await res.json();

        const ctx = document.getElementById('monthlySalesChart').getContext('2d');
        const months = data.map(item => item.month);
        const revenue = data.map(item => item.revenue);

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Monthly Revenue (₹)',
                    data: revenue,
                    fill: true,
                    backgroundColor: 'rgba(34, 211, 238, 0.1)',
                    borderColor: '#22d3ee',
                    borderWidth: 3,
                    tension: 0.4,
                    pointBackgroundColor: '#22d3ee',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#6366f1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom' }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(148, 163, 184, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        grid: { color: 'rgba(148, 163, 184, 0.05)' },
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) { return '₹' + value.toLocaleString(); }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Monthly Sales Chart Error:", error);
    }
}
