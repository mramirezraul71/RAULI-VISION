#!/bin/bash

# ⚡ Performance Benchmark Script for RAULI-VISION
# Comprehensive performance testing and optimization

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_URL="${1:-https://rauli-vision.com}"
CONCURRENT_USERS="${2:-100}"
TEST_DURATION="${3:-60s}"
RESULTS_DIR="./benchmark-results-$(date +%Y%m%d_%H%M%S)"

# Tools check
check_tools() {
    local tools=("curl" "ab" "wrk" "hey" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            echo -e "${YELLOW}⚠️ $tool not found, installing...${NC}"
            case "$tool" in
                "ab")
                    sudo apt-get update && sudo apt-get install -y apache2-utils || echo "Please install ab manually"
                    ;;
                "wrk")
                    sudo apt-get update && sudo apt-get install -y wrk || echo "Please install wrk manually"
                    ;;
                "hey")
                    go install github.com/rakyll/hey@latest || echo "Please install hey manually"
                    ;;
                "jq")
                    sudo apt-get update && sudo apt-get install -y jq || echo "Please install jq manually"
                    ;;
            esac
        fi
    done
}

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Create results directory
setup_results() {
    mkdir -p "$RESULTS_DIR"
    log "📊 Results will be saved to: $RESULTS_DIR"
}

# Baseline performance test
baseline_test() {
    log "🎯 Running baseline performance test..."
    
    # Single request baseline
    local start_time=$(date +%s%N)
    curl -s "$APP_URL/api/health" > /dev/null
    local end_time=$(date +%s%N)
    local baseline_time=$(( (end_time - start_time) / 1000000 ))
    
    echo "$baseline_time" > "$RESULTS_DIR/baseline_response_time.txt"
    success "✅ Baseline response time: ${baseline_time}ms"
}

# Load testing with Apache Bench
apache_bench_test() {
    log "🔨 Running Apache Bench load test..."
    
    local requests=1000
    local concurrency=10
    
    ab -n "$requests" -c "$concurrency" -g "$RESULTS_DIR/ab_results.tsv" "$APP_URL/" > "$RESULTS_DIR/ab_output.txt" 2>&1
    
    # Extract key metrics
    local rps=$(grep "Requests per second" "$RESULTS_DIR/ab_output.txt" | awk '{print $4}')
    local mean_time=$(grep "Time per request.*mean" "$RESULTS_DIR/ab_output.txt" | awk '{print $4}')
    
    echo "$rps" > "$RESULTS_DIR/ab_rps.txt"
    echo "$mean_time" > "$RESULTS_DIR/ab_mean_time.txt"
    
    success "✅ Apache Bench: $rps RPS, ${mean_time}ms mean"
}

# Load testing with wrk
wrk_test() {
    log "⚡ Running wrk load test..."
    
    local duration=30s
    local threads=12
    local connections=100
    
    wrk -t "$threads" -c "$connections" -d "$duration" --latency \
        -s "$RESULTS_DIR/wrk_script.lua" "$APP_URL/" > "$RESULTS_DIR/wrk_output.txt" 2>&1 || \
    wrk -t "$threads" -c "$connections" -d "$duration" --latency "$APP_URL/" > "$RESULTS_DIR/wrk_output.txt" 2>&1
    
    # Extract metrics
    local rps=$(grep "Requests/sec" "$RESULTS_DIR/wrk_output.txt" | awk '{print $2}')
    local latency=$(grep "Latency" "$RESULTS_DIR/wrk_output.txt" | head -1 | awk '{print $2}')
    
    echo "$rps" > "$RESULTS_DIR/wrk_rps.txt"
    echo "$latency" > "$RESULTS_DIR/wrk_latency.txt"
    
    success "✅ wrk: $rps RPS, $latency latency"
}

# Load testing with hey
hey_test() {
    log "👋 Running hey load test..."
    
    local requests=500
    local concurrency=25
    
    hey -n "$requests" -c "$concurrency" -o "$RESULTS_DIR/hey_output.json" "$APP_URL/"
    
    # Extract metrics
    local rps=$(jq -r '.rps' "$RESULTS_DIR/hey_output.json")
    local fastest=$(jq -r '.fastest' "$RESULTS_DIR/hey_output.json")
    local slowest=$(jq -r '.slowest' "$RESULTS_DIR/hey_output.json")
    local mean=$(jq -r '.average' "$RESULTS_DIR/hey_output.json")
    
    echo "$rps" > "$RESULTS_DIR/hey_rps.txt"
    echo "$fastest" > "$RESULTS_DIR/hey_fastest.txt"
    echo "$slowest" > "$RESULTS_DIR/hey_slowest.txt"
    echo "$mean" > "$RESULTS_DIR/hey_mean.txt"
    
    success "✅ hey: $rps RPS, ${mean}ms average (${fastest}ms-${slowest}ms)"
}

# Stress testing
stress_test() {
    log "💪 Running stress test..."
    
    local max_users=500
    local step=50
    local step_duration=10s
    
    for users in $(seq $step $step $max_users); do
        log "🔄 Testing with $users concurrent users..."
        
        # Run hey with current user count
        hey -n 1000 -c "$users" -o "$RESULTS_DIR/stress_${users}.json" "$APP_URL/" &
        
        # Monitor system resources during test
        (
            for i in $(seq 1 10); do
                echo "$(date +%s),$(ps aux | grep 'rauli-vision' | awk '{sum+=$3} END {print sum}'),$(ps aux | grep 'rauli-vision' | awk '{sum+=$4} END {print sum}')" >> "$RESULTS_DIR/stress_${users}_resources.csv"
                sleep 1
            done
        ) &
        
        wait
        
        # Check if system is overwhelmed
        local avg_response=$(jq -r '.average' "$RESULTS_DIR/stress_${users}.json")
        if (( $(echo "$avg_response > 5000" | bc -l) )); then
            warning "⚠️ Response time too high at $users users: ${avg_response}ms"
            break
        fi
    done
    
    success "✅ Stress test completed"
}

# API endpoint testing
api_endpoint_test() {
    log "🔌 Testing API endpoints..."
    
    local endpoints=(
        "/api/health"
        "/api/search?q=test"
        "/api/auth/login"
        "/api/user/profile"
    )
    
    for endpoint in "${endpoints[@]}"; do
        log "🔍 Testing $endpoint..."
        
        # Test endpoint performance
        local start_time=$(date +%s%N)
        local status_code=$(curl -s -w "%{http_code}" -o /dev/null "$APP_URL$endpoint")
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 ))
        
        echo "$endpoint,$status_code,$response_time" >> "$RESULTS_DIR/api_endpoints.csv"
        
        if [[ "$status_code" == "200" ]]; then
            success "✅ $endpoint: ${response_time}ms"
        else
            warning "⚠️ $endpoint: HTTP $status_code (${response_time}ms)"
        fi
    done
}

# Database performance test
database_test() {
    log "🗄️ Testing database performance..."
    
    # Test database connection time
    local start_time=$(date +%s%N)
    curl -s "$APP_URL/api/health" > /dev/null
    local end_time=$(date +%s%N)
    local db_time=$(( (end_time - start_time) / 1000000 ))
    
    echo "$db_time" > "$RESULTS_DIR/db_response_time.txt"
    
    # Test database queries
    local queries=(
        "search?q=test"
        "user/profile"
        "analytics/data"
    )
    
    for query in "${queries[@]}"; do
        local start_time=$(date +%s%N)
        curl -s "$APP_URL/api/$query" > /dev/null
        local end_time=$(date +%s%N)
        local query_time=$(( (end_time - start_time) / 1000000 ))
        
        echo "$query,$query_time" >> "$RESULTS_DIR/db_queries.csv"
    done
    
    success "✅ Database performance test completed"
}

# Cache performance test
cache_test() {
    log "💾 Testing cache performance..."
    
    # First request (cache miss)
    local start_time=$(date +%s%N)
    curl -s "$APP_URL/api/search?q=test" > /dev/null
    local end_time=$(date +%s%N)
    local cache_miss_time=$(( (end_time - start_time) / 1000000 ))
    
    # Second request (cache hit)
    start_time=$(date +%s%N)
    curl -s "$APP_URL/api/search?q=test" > /dev/null
    end_time=$(date +%s%N)
    local cache_hit_time=$(( (end_time - start_time) / 1000000 ))
    
    echo "$cache_miss_time" > "$RESULTS_DIR/cache_miss_time.txt"
    echo "$cache_hit_time" > "$RESULTS_DIR/cache_hit_time.txt"
    
    local cache_improvement=$(( cache_miss_time - cache_hit_time ))
    local cache_improvement_percent=$(( (cache_improvement * 100) / cache_miss_time ))
    
    success "✅ Cache: ${cache_hit_time}ms (hit) vs ${cache_miss_time}ms (miss) - ${cache_improvement_percent}% improvement"
}

# Frontend performance test
frontend_test() {
    log "📱 Testing frontend performance..."
    
    # Test page load time
    local start_time=$(date +%s%N)
    curl -s "$APP_URL/" > /dev/null
    local end_time=$(date +%s%N)
    local page_load_time=$(( (end_time - start_time) / 1000000 ))
    
    echo "$page_load_time" > "$RESULTS_DIR/page_load_time.txt"
    
    # Test static assets
    local assets=(
        "/favicon.svg"
        "/manifest.webmanifest"
        "/static/js/main.js"
        "/static/css/main.css"
    )
    
    for asset in "${assets[@]}"; do
        local start_time=$(date +%s%N)
        local status_code=$(curl -s -w "%{http_code}" -o /dev/null "$APP_URL$asset")
        local end_time=$(date +%s%N)
        local asset_time=$(( (end_time - start_time) / 1000000 ))
        
        echo "$asset,$status_code,$asset_time" >> "$RESULTS_DIR/static_assets.csv"
    done
    
    success "✅ Frontend performance: ${page_load_time}ms page load"
}

# Mobile performance test
mobile_test() {
    log "📱 Testing mobile performance..."
    
    # Simulate mobile user agent
    local mobile_ua="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15"
    
    local start_time=$(date +%s%N)
    curl -s -H "User-Agent: $mobile_ua" "$APP_URL/" > /dev/null
    local end_time=$(date +%s%N)
    local mobile_time=$(( (end_time - start_time) / 1000000 ))
    
    echo "$mobile_time" > "$RESULTS_DIR/mobile_response_time.txt"
    
    success "✅ Mobile performance: ${mobile_time}ms"
}

# Generate performance report
generate_report() {
    log "📊 Generating performance report..."
    
    cat > "$RESULTS_DIR/performance_report.md" << EOF
# RAULI-VISION Performance Report

**Date:** $(date)
**Target:** $APP_URL
**Test Duration:** $TEST_DURATION

## 📊 Summary

### Baseline Performance
- **Response Time:** $(cat "$RESULTS_DIR/baseline_response_time.txt")ms

### Load Testing Results

#### Apache Bench
- **Requests/sec:** $(cat "$RESULTS_DIR/ab_rps.txt")
- **Mean Response Time:** $(cat "$RESULTS_DIR/ab_mean_time.txt")ms

#### wrk
- **Requests/sec:** $(cat "$RESULTS_DIR/wrk_rps.txt")
- **Latency:** $(cat "$RESULTS_DIR/wrk_latency.txt")

#### hey
- **Requests/sec:** $(cat "$RESULTS_DIR/hey_rps.txt")
- **Fastest:** $(cat "$RESULTS_DIR/hey_fastest.txt")ms
- **Slowest:** $(cat "$RESULTS_DIR/hey_slowest.txt")ms
- **Average:** $(cat "$RESULTS_DIR/hey_mean.txt")ms

### Database Performance
- **Connection Time:** $(cat "$RESULTS_DIR/db_response_time.txt")ms

### Cache Performance
- **Cache Hit:** $(cat "$RESULTS_DIR/cache_hit_time.txt")ms
- **Cache Miss:** $(cat "$RESULTS_DIR/cache_miss_time.txt")ms

### Frontend Performance
- **Page Load Time:** $(cat "$RESULTS_DIR/page_load_time.txt")ms

### Mobile Performance
- **Mobile Response Time:** $(cat "$RESULTS_DIR/mobile_response_time.txt")ms

## 📈 Performance Grades

| Metric | Score | Status |
|--------|-------|---------|
| Response Time | $(if [ $(cat "$RESULTS_DIR/baseline_response_time.txt") -lt 200 ]; then echo "A+"; elif [ $(cat "$RESULTS_DIR/baseline_response_time.txt") -lt 500 ]; then echo "B"; else echo "C"; fi) | $(if [ $(cat "$RESULTS_DIR/baseline_response_time.txt") -lt 200 ]; then echo "✅ Excellent"; elif [ $(cat "$RESULTS_DIR/baseline_response_time.txt") -lt 500 ]; then echo "⚠️ Good"; else echo "❌ Needs Improvement"; fi) |
| Throughput | $(if [ $(cat "$RESULTS_DIR/ab_rps.txt") -gt 1000 ]; then echo "A+"; elif [ $(cat "$RESULTS_DIR/ab_rps.txt") -gt 500 ]; then echo "B"; else echo "C"; fi) | $(if [ $(cat "$RESULTS_DIR/ab_rps.txt") -gt 1000 ]; then echo "✅ Excellent"; elif [ $(cat "$RESULTS_DIR/ab_rps.txt") -gt 500 ]; then echo "⚠️ Good"; else echo "❌ Needs Improvement"; fi) |
| Cache Efficiency | $(if [ $(cat "$RESULTS_DIR/cache_hit_time.txt") -lt 50 ]; then echo "A+"; elif [ $(cat "$RESULTS_DIR/cache_hit_time.txt") -lt 100 ]; then echo "B"; else echo "C"; fi) | $(if [ $(cat "$RESULTS_DIR/cache_hit_time.txt") -lt 50 ]; then echo "✅ Excellent"; elif [ $(cat "$RESULTS_DIR/cache_hit_time.txt") -lt 100 ]; then echo "⚠️ Good"; else echo "❌ Needs Improvement"; fi) |

## 🎯 Recommendations

EOF

    # Add recommendations based on results
    local baseline_time=$(cat "$RESULTS_DIR/baseline_response_time.txt")
    local rps=$(cat "$RESULTS_DIR/ab_rps.txt")
    local cache_hit=$(cat "$RESULTS_DIR/cache_hit_time.txt")
    
    if [ "$baseline_time" -gt 500 ]; then
        echo "- Consider optimizing database queries" >> "$RESULTS_DIR/performance_report.md"
        echo "- Implement response caching" >> "$RESULTS_DIR/performance_report.md"
        echo "- Review code for performance bottlenecks" >> "$RESULTS_DIR/performance_report.md"
    fi
    
    if [ "$rps" -lt 500 ]; then
        echo "- Increase server resources" >> "$RESULTS_DIR/performance_report.md"
        echo "- Implement horizontal scaling" >> "$RESULTS_DIR/performance_report.md"
        echo "- Optimize application code" >> "$RESULTS_DIR/performance_report.md"
    fi
    
    if [ "$cache_hit" -gt 100 ]; then
        echo "- Optimize cache configuration" >> "$RESULTS_DIR/performance_report.md"
        echo "- Consider using Redis for better performance" >> "$RESULTS_DIR/performance_report.md"
        echo "- Implement CDN for static assets" >> "$RESULTS_DIR/performance_report.md"
    fi
    
    success "✅ Performance report generated: $RESULTS_DIR/performance_report.md"
}

# Create performance dashboard
create_dashboard() {
    log "📈 Creating performance dashboard..."
    
    cat > "$RESULTS_DIR/dashboard.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>RAULI-VISION Performance Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric { display: inline-block; margin: 10px 20px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #2ecc71; }
        .metric-label { color: #7f8c8d; }
        .chart-container { position: relative; height: 400px; margin: 20px 0; }
        h1, h2 { color: #2c3e50; }
        .status-good { color: #27ae60; }
        .status-warning { color: #f39c12; }
        .status-bad { color: #e74c3c; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 RAULI-VISION Performance Dashboard</h1>
        
        <div class="card">
            <h2>📊 Key Metrics</h2>
            <div class="metric">
                <div class="metric-value" id="responseTime">--</div>
                <div class="metric-label">Response Time (ms)</div>
            </div>
            <div class="metric">
                <div class="metric-value" id="throughput">--</div>
                <div class="metric-label">Requests/sec</div>
            </div>
            <div class="metric">
                <div class="metric-value" id="cacheHit">--</div>
                <div class="metric-label">Cache Hit (ms)</div>
            </div>
            <div class="metric">
                <div class="metric-value" id="pageLoad">--</div>
                <div class="metric-label">Page Load (ms)</div>
            </div>
        </div>
        
        <div class="card">
            <h2>📈 Performance Trends</h2>
            <div class="chart-container">
                <canvas id="performanceChart"></canvas>
            </div>
        </div>
        
        <div class="card">
            <h2>🎯 Performance Grades</h2>
            <div id="grades"></div>
        </div>
    </div>

    <script>
        // Load performance data
        async function loadData() {
            try {
                const response = await fetch('./performance_data.json');
                const data = await response.json();
                
                // Update metrics
                document.getElementById('responseTime').textContent = data.baselineTime;
                document.getElementById('throughput').textContent = data.rps;
                document.getElementById('cacheHit').textContent = data.cacheHit;
                document.getElementById('pageLoad').textContent = data.pageLoad;
                
                // Update chart
                updateChart(data);
                
                // Update grades
                updateGrades(data);
                
            } catch (error) {
                console.error('Error loading data:', error);
            }
        }
        
        function updateChart(data) {
            const ctx = document.getElementById('performanceChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Baseline', 'Apache Bench', 'wrk', 'hey'],
                    datasets: [{
                        label: 'Response Time (ms)',
                        data: [data.baselineTime, data.abMeanTime, data.wrkLatency, data.heyMean],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
        
        function updateGrades(data) {
            const grades = document.getElementById('grades');
            const metrics = [
                { name: 'Response Time', value: data.baselineTime, threshold: 200 },
                { name: 'Throughput', value: data.rps, threshold: 1000, reverse: true },
                { name: 'Cache Efficiency', value: data.cacheHit, threshold: 50 }
            ];
            
            metrics.forEach(metric => {
                const grade = metric.reverse ? 
                    (metric.value > metric.threshold ? 'A+' : metric.value > metric.threshold/2 ? 'B' : 'C') :
                    (metric.value < metric.threshold ? 'A+' : metric.value < metric.threshold*2.5 ? 'B' : 'C');
                
                const status = grade === 'A+' ? 'status-good' : grade === 'B' ? 'status-warning' : 'status-bad';
                
                grades.innerHTML += `
                    <div style="margin: 10px 0;">
                        <strong>${metric.name}:</strong> 
                        <span class="${status}">${grade}</span> (${metric.value})
                    </div>
                `;
            });
        }
        
        // Load data when page loads
        loadData();
    </script>
</body>
</html>
EOF
    
    # Create data file for dashboard
    cat > "$RESULTS_DIR/performance_data.json" << EOF
{
    "baselineTime": $(cat "$RESULTS_DIR/baseline_response_time.txt"),
    "rps": $(cat "$RESULTS_DIR/ab_rps.txt"),
    "abMeanTime": $(cat "$RESULTS_DIR/ab_mean_time.txt"),
    "wrkLatency": $(cat "$RESULTS_DIR/wrk_latency.txt"),
    "heyMean": $(cat "$RESULTS_DIR/hey_mean.txt"),
    "cacheHit": $(cat "$RESULTS_DIR/cache_hit_time.txt"),
    "pageLoad": $(cat "$RESULTS_DIR/page_load_time.txt")
}
EOF
    
    success "✅ Performance dashboard created: $RESULTS_DIR/dashboard.html"
}

# Main execution
main() {
    log "⚡ Starting Performance Benchmark for RAULI-VISION"
    log "🌐 Target: $APP_URL"
    log "👥 Concurrent Users: $CONCURRENT_USERS"
    log "⏱️ Duration: $TEST_DURATION"
    
    check_tools
    setup_results
    
    baseline_test
    apache_bench_test
    wrk_test
    hey_test
    stress_test
    api_endpoint_test
    database_test
    cache_test
    frontend_test
    mobile_test
    
    generate_report
    create_dashboard
    
    success "🎉 Performance benchmark completed!"
    log "📊 Results available in: $RESULTS_DIR"
    log "🌐 Open dashboard: file://$(pwd)/$RESULTS_DIR/dashboard.html"
}

# Execute main function
main "$@"
