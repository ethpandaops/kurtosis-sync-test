// Configuration
const GITHUB_REPO = 'ethpandaops/kurtosis-sync-test';
const DATA_BRANCH = 'data';
const DEFAULT_DAYS = 3;

// Global state
let allTestResults = [];
let filteredResults = [];
let availableNetworks = new Set();
let trendsChart = null;
let currentView = 'results'; // 'results' or 'detail'
let currentRunData = null;

// Initialize the app
async function init() {
    setupEventListeners();
    await loadTestResults();
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('dateRange').addEventListener('change', handleDateRangeChange);
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('backToResults').addEventListener('click', showResultsView);
    
    // Handle browser back/forward
    window.addEventListener('popstate', handlePopState);
    
    // Set default dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DEFAULT_DAYS);
    
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    
    // Handle initial route
    handleInitialRoute();
}

// Routing functions
function handleInitialRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#run/')) {
        const runId = hash.substring(5);
        // We'll load the run details after data is loaded
        setTimeout(() => showRunDetail(runId), 100);
    }
}

function handlePopState(e) {
    const hash = window.location.hash;
    if (hash.startsWith('#run/')) {
        const runId = hash.substring(5);
        showRunDetail(runId);
    } else {
        showResultsView();
    }
}

function showResultsView() {
    currentView = 'results';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('runDetailSection').style.display = 'none';
    document.querySelector('.charts-section').style.display = 'block';
    window.history.pushState(null, '', '#');
}

function showRunDetail(runIdentifier) {
    // Find the run by ID, run_number, or other identifier
    const run = allTestResults.find(r => 
        r.github?.run_id === runIdentifier ||
        r.github?.run_number === runIdentifier ||
        `${r.date}-${r.network}-${r.el_client}-${r.cl_client}` === runIdentifier
    );
    
    if (!run) {
        console.error('Run not found:', runIdentifier);
        showResultsView();
        return;
    }
    
    currentView = 'detail';
    currentRunData = run;
    
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('runDetailSection').style.display = 'block';
    document.querySelector('.charts-section').style.display = 'none';
    
    populateRunDetail(run);
    window.history.pushState(null, '', `#run/${runIdentifier}`);
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
    const endTime = test.end_time ? new Date(test.end_time * 1000) : null;
    const duration = test.duration ? `${test.duration}s` : 'N/A';
    
    // Create GitHub Actions URL if we have run_id
    const runId = test.github?.run_id;
    const runIdDisplay = runId ? 
        `<a href="https://github.com/${GITHUB_REPO}/actions/runs/${runId}" target="_blank" class="run-id-link" onclick="event.stopPropagation()">${runId}</a>` :
        'N/A';
    
    // Additional metadata
    const testType = test.test_type || 'standard';
    const actor = test.github?.actor || 'N/A';
    const workflowName = test.github?.workflow || 'N/A';
    
    card.innerHTML = `
        <div class="client-info">
            <div class="client-pair">${test.el_client} + ${test.cl_client}</div>
            <div class="test-type-badge">${testType}</div>
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
                <span class="metadata-label">Start Time</span>
                <span class="metadata-value">${startTime.toLocaleTimeString()}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Duration</span>
                <span class="metadata-value">${duration}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Workflow</span>
                <span class="metadata-value">${workflowName}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Actor</span>
                <span class="metadata-value">${actor}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Run ID</span>
                <span class="metadata-value">${runIdDisplay}</span>
            </div>
        </div>
        <span class="status-badge ${test.result}">${test.result}</span>
        <div class="card-click-hint">Click for details →</div>
    `;
    
    // Make card clickable
    card.addEventListener('click', (e) => {
        // Don't navigate if clicking on the GitHub Actions link
        if (e.target.closest('.run-id-link')) {
            return;
        }
        const identifier = runId || `${test.date}-${test.network}-${test.el_client}-${test.cl_client}`;
        showRunDetail(identifier);
    });
    
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

// Populate detailed run view
function populateRunDetail(test) {
    const startTime = new Date(test.start_time * 1000);
    const endTime = test.end_time ? new Date(test.end_time * 1000) : null;
    const duration = test.duration ? `${test.duration}s` : 'N/A';
    
    // Set title
    document.getElementById('runDetailTitle').textContent = 
        `${test.el_client} + ${test.cl_client} on ${test.network}`;
    
    // Create detailed content
    const content = document.getElementById('runDetailContent');
    content.innerHTML = `
        <div class="detail-section">
            <h3>Test Overview</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <span class="status-badge ${test.result}">${test.result}</span>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Network</span>
                    <span class="detail-value">${test.network}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">EL Client</span>
                    <span class="detail-value">${test.el_client}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">CL Client</span>
                    <span class="detail-value">${test.cl_client}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Test Type</span>
                    <span class="detail-value">${test.test_type || 'standard'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Duration</span>
                    <span class="detail-value">${duration}</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Timeline</h3>
            <div class="timeline-item">
                <div class="timeline-icon ${test.result}"></div>
                <div class="timeline-content">
                    <h4>Test Started</h4>
                    <p>${startTime.toLocaleString()}</p>
                </div>
            </div>
            ${endTime ? `
            <div class="timeline-item">
                <div class="timeline-icon ${test.result}"></div>
                <div class="timeline-content">
                    <h4>Test ${test.result === 'success' ? 'Completed' : 'Failed'}</h4>
                    <p>${endTime.toLocaleString()}</p>
                </div>
            </div>
            ` : ''}
        </div>

        <div class="detail-section">
            <h3>GitHub Actions</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Workflow</span>
                    <span class="detail-value">${test.github?.workflow || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Run ID</span>
                    <span class="detail-value">
                        ${test.github?.run_id ? 
                            `<a href="https://github.com/${GITHUB_REPO}/actions/runs/${test.github.run_id}" target="_blank" class="run-id-link">${test.github.run_id}</a>` :
                            'N/A'
                        }
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Run Number</span>
                    <span class="detail-value">${test.github?.run_number || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Actor</span>
                    <span class="detail-value">${test.github?.actor || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Commit SHA</span>
                    <span class="detail-value">
                        ${test.github?.sha ? 
                            `<a href="https://github.com/${GITHUB_REPO}/commit/${test.github.sha}" target="_blank" class="run-id-link">${test.github.sha.substring(0, 7)}</a>` :
                            'N/A'
                        }
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Reference</span>
                    <span class="detail-value">${test.github?.ref?.replace('refs/heads/', '') || 'N/A'}</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Test Configuration</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Enclave Name</span>
                    <span class="detail-value">${test.enclave_name || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Genesis Sync</span>
                    <span class="detail-value">${test.genesis_sync || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Saved At</span>
                    <span class="detail-value">${test.saved_at ? new Date(test.saved_at).toLocaleString() : 'N/A'}</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Raw Metadata</h3>
            <div class="metadata-json">${JSON.stringify(test, null, 2)}</div>
        </div>
    `;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);