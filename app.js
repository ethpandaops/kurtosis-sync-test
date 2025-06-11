// Configuration
const GITHUB_REPO = 'ethpandaops/kurtosis-sync-test';
const DATA_BRANCH = 'data';
const DEFAULT_DAYS = 3;

// Global state
let allTestResults = [];
let filteredResults = [];
let availableNetworks = new Set();
let trendsChart = null;

// Initialize the app
async function init() {
    setupEventListeners();
    await loadTestResults();
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('dateRange').addEventListener('change', handleDateRangeChange);
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    
    // Set default dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DEFAULT_DAYS);
    
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
}

// Handle date range dropdown change
function handleDateRangeChange(e) {
    const customDateRange = document.getElementById('customDateRange');
    if (e.target.value === 'custom') {
        customDateRange.style.display = 'flex';
    } else {
        customDateRange.style.display = 'none';
        
        // Set dates based on selection
        const days = parseInt(e.target.value);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
        document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    }
}

// Load test results from data branch
async function loadTestResults() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    
    try {
        // First, fetch the catalog to know what dates/networks are available
        const catalogUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${DATA_BRANCH}/catalog.json`;
        const catalogResponse = await fetch(catalogUrl);
        
        if (!catalogResponse.ok) {
            throw new Error('No test data available yet. Run some tests first!');
        }
        
        const catalog = await catalogResponse.json();
        
        // Get date range
        const dateRange = document.getElementById('dateRange').value;
        const days = dateRange === 'custom' ? 
            Math.ceil((new Date(document.getElementById('endDate').value) - new Date(document.getElementById('startDate').value)) / (1000 * 60 * 60 * 24)) :
            parseInt(dateRange);
        
        const endDate = dateRange === 'custom' ? 
            new Date(document.getElementById('endDate').value) :
            new Date();
        const startDate = dateRange === 'custom' ?
            new Date(document.getElementById('startDate').value) :
            new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
        
        // Filter catalog entries by date range
        const relevantEntries = catalog.dates.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= startDate && entryDate <= endDate;
        });
        
        // Load all relevant test results
        allTestResults = [];
        availableNetworks.clear();
        
        for (const entry of relevantEntries) {
            availableNetworks.add(entry.network);
            
            try {
                // Fetch the index for this date/network
                const indexUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${DATA_BRANCH}/results/${entry.date}/${entry.network}/index.json`;
                const indexResponse = await fetch(indexUrl);
                
                if (indexResponse.ok) {
                    const index = await indexResponse.json();
                    
                    // Add all tests from this index
                    for (const test of index.tests) {
                        allTestResults.push({
                            ...test.metadata,
                            date: entry.date,
                            network: entry.network
                        });
                    }
                }
            } catch (err) {
                console.error(`Error loading ${entry.date}/${entry.network}:`, err);
            }
        }
        
        // Update network filter
        updateNetworkFilter();
        
        // Apply initial filters
        applyFilters();
        
        loading.style.display = 'none';
    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.textContent = `Error loading test results: ${err.message}`;
    }
}

// Update network filter dropdown
function updateNetworkFilter() {
    const networkFilter = document.getElementById('networkFilter');
    networkFilter.innerHTML = '<option value="">All Networks</option>';
    
    Array.from(availableNetworks).sort().forEach(network => {
        const option = document.createElement('option');
        option.value = network;
        option.textContent = network;
        networkFilter.appendChild(option);
    });
}

// Apply filters to test results
function applyFilters() {
    const network = document.getElementById('networkFilter').value;
    const elClient = document.getElementById('elClientFilter').value;
    const clClient = document.getElementById('clClientFilter').value;
    const status = document.getElementById('statusFilter').value;
    
    filteredResults = allTestResults.filter(test => {
        if (network && test.network !== network) return false;
        if (elClient && test.el_client !== elClient) return false;
        if (clClient && test.cl_client !== clClient) return false;
        if (status && test.result !== status) return false;
        return true;
    });
    
    // Sort by date/time descending
    filteredResults.sort((a, b) => b.start_time - a.start_time);
    
    updateSummaryCards();
    displayResults();
    updateTrendsChart();
}

// Update summary cards
function updateSummaryCards() {
    const total = filteredResults.length;
    const successful = filteredResults.filter(t => t.result === 'success').length;
    const failed = filteredResults.filter(t => t.result === 'failure').length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
    
    document.getElementById('totalTests').textContent = total;
    document.getElementById('successfulTests').textContent = successful;
    document.getElementById('failedTests').textContent = failed;
    document.getElementById('successRate').textContent = `${successRate}%`;
}

// Display results grid
function displayResults() {
    const resultsGrid = document.getElementById('resultsGrid');
    resultsGrid.innerHTML = '';
    
    if (filteredResults.length === 0) {
        resultsGrid.innerHTML = '<p style="text-align: center; color: #586069;">No test results found for the selected filters.</p>';
        return;
    }
    
    filteredResults.forEach(test => {
        const card = createResultCard(test);
        resultsGrid.appendChild(card);
    });
}

// Create a result card element
function createResultCard(test) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    const startTime = new Date(test.start_time * 1000);
    const duration = test.duration ? `${test.duration}s` : 'N/A';
    
    // Create GitHub Actions URL if we have run_id
    const runId = test.github?.run_id;
    const runIdDisplay = runId ? 
        `<a href="https://github.com/${GITHUB_REPO}/actions/runs/${runId}" target="_blank" class="run-id-link">${runId}</a>` :
        'N/A';
    
    card.innerHTML = `
        <div class="client-info">
            <div class="client-pair">${test.el_client} + ${test.cl_client}</div>
        </div>
        <div class="test-metadata">
            <div class="metadata-item">
                <span class="metadata-label">Network</span>
                <span class="metadata-value">${test.network}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Date</span>
                <span class="metadata-value">${startTime.toLocaleDateString()}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Time</span>
                <span class="metadata-value">${startTime.toLocaleTimeString()}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Duration</span>
                <span class="metadata-value">${duration}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Run ID</span>
                <span class="metadata-value">${runIdDisplay}</span>
            </div>
        </div>
        <span class="status-badge ${test.result}">${test.result}</span>
    `;
    
    return card;
}

// Update trends chart
function updateTrendsChart() {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    
    // Group results by date
    const resultsByDate = {};
    filteredResults.forEach(test => {
        if (!resultsByDate[test.date]) {
            resultsByDate[test.date] = { success: 0, failure: 0 };
        }
        if (test.result === 'success') {
            resultsByDate[test.date].success++;
        } else if (test.result === 'failure') {
            resultsByDate[test.date].failure++;
        }
    });
    
    // Sort dates
    const dates = Object.keys(resultsByDate).sort();
    
    // Prepare chart data
    const chartData = {
        labels: dates,
        datasets: [
            {
                label: 'Successful Tests',
                data: dates.map(date => resultsByDate[date].success),
                backgroundColor: '#28a745',
                borderColor: '#28a745',
                borderWidth: 2,
                tension: 0.1
            },
            {
                label: 'Failed Tests',
                data: dates.map(date => resultsByDate[date].failure),
                backgroundColor: '#d73a49',
                borderColor: '#d73a49',
                borderWidth: 2,
                tension: 0.1
            }
        ]
    };
    
    // Update or create chart
    if (trendsChart) {
        trendsChart.data = chartData;
        trendsChart.update();
    } else {
        trendsChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Test Results Over Time'
                    },
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);