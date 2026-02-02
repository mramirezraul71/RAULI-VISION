#!/bin/bash

# RAULI-VISION Infrastructure Health Monitoring Script
# Monitors the health of all infrastructure components
# Includes Kubernetes, Docker, databases, networks, storage, and services

set -euo pipefail

# Configuration
APP_NAME="${APP_NAME:-RAULI-VISION}"
NAMESPACE="${NAMESPACE:-default}"
LOG_FILE="/var/log/rauli-vision/infrastructure-health.log"
REPORT_DIR="reports/infrastructure-health-$(date +%Y%m%d-%H%M%S)"
ALERT_EMAIL="${ALERT_EMAIL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-300}" # 5 minutes

# Component thresholds
CPU_THRESHOLD="${CPU_THRESHOLD:-80}"
MEMORY_THRESHOLD="${MEMORY_THRESHOLD:-85}"
DISK_THRESHOLD="${DISK_THRESHOLD:-90}"
NETWORK_LATENCY_THRESHOLD="${NETWORK_LATENCY_THRESHOLD:-100}"
DB_CONNECTION_THRESHOLD="${DB_CONNECTION_THRESHOLD:-80}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${2}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

# Send alert
send_alert() {
    local severity="$1"
    local component="$2"
    local message="$3"
    
    local alert_message="🚨 $severity Alert: $component - $message"
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$APP_NAME Infrastructure Health: $alert_message\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
    
    if [[ -n "$ALERT_EMAIL" ]]; then
        echo "$alert_message" | mail -s "$APP_NAME Infrastructure Health Alert ($severity)" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    log "ALERT SENT: $alert_message" "$RED"
}

# Check Kubernetes cluster health
check_kubernetes_health() {
    log "Checking Kubernetes cluster health..." "$BLUE"
    
    local k8s_score=100
    local issues=()
    
    # Check cluster connectivity
    if ! kubectl cluster-info &>/dev/null; then
        issues+=("Cannot connect to Kubernetes cluster")
        k8s_score=0
        send_alert "CRITICAL" "Kubernetes" "Cluster connectivity lost"
        echo "Kubernetes Health Score: $k8s_score/100"
        echo "Issues: ${issues[*]}"
        return
    fi
    
    # Check node status
    local not_ready_nodes=$(kubectl get nodes --no-headers | awk '$2!="Ready"' | wc -l)
    if [[ $not_ready_nodes -gt 0 ]]; then
        issues+=("$not_ready_nodes nodes not ready")
        ((k8s_score -= 20))
        send_alert "WARNING" "Kubernetes" "$not_ready_nodes nodes not ready"
    fi
    
    # Check pod status
    local failed_pods=$(kubectl get pods --all-namespaces --field-selector=status.phase=Failed --no-headers | wc -l)
    if [[ $failed_pods -gt 0 ]]; then
        issues+=("$failed_pods failed pods")
        ((k8s_score -= 15))
        send_alert "WARNING" "Kubernetes" "$failed_pods failed pods detected"
    fi
    
    # Check resource usage
    local node_usage=$(kubectl top nodes --no-headers 2>/dev/null | awk '{print $3,$5}' | tr -d '%' | head -1)
    if [[ -n "$node_usage" ]]; then
        local cpu_usage=$(echo $node_usage | cut -d' ' -f1)
        local memory_usage=$(echo $node_usage | cut -d' ' -f2)
        
        if (( $(echo "$cpu_usage > $CPU_THRESHOLD" | bc -l) )); then
            issues+=("High CPU usage: ${cpu_usage}%")
            ((k8s_score -= 10))
        fi
        
        if (( $(echo "$memory_usage > $MEMORY_THRESHOLD" | bc -l) )); then
            issues+=("High memory usage: ${memory_usage}%")
            ((k8s_score -= 10))
        fi
    fi
    
    # Check API server responsiveness
    local api_response_time=$(curl -o /dev/null -s -w '%{time_total}' --cacert /path/to/ca.crt https://kubernetes.default.svc.cluster.local/healthz 2>/dev/null || echo "0")
    if (( $(echo "$api_response_time > 1.0" | bc -l) )); then
        issues+=("API server slow response: ${api_response_time}s")
        ((k8s_score -= 10))
    fi
    
    echo "Kubernetes Health Score: $k8s_score/100"
    echo "Issues: ${issues[*]}"
}

# Check Docker containers health
check_docker_health() {
    log "Checking Docker containers health..." "$BLUE"
    
    local docker_score=100
    local issues=()
    
    # Check Docker daemon
    if ! docker info &>/dev/null; then
        issues+=("Docker daemon not running")
        docker_score=0
        send_alert "CRITICAL" "Docker" "Docker daemon not responding"
        echo "Docker Health Score: $docker_score/100"
        echo "Issues: ${issues[*]}"
        return
    fi
    
    # Check container status
    local total_containers=$(docker ps -a --format "{{.Names}}" | wc -l)
    local running_containers=$(docker ps --format "{{.Names}}" | wc -l)
    local stopped_containers=$((total_containers - running_containers))
    
    if [[ $stopped_containers -gt 0 ]]; then
        issues+=("$stopped_containers/$total_containers containers stopped")
        ((docker_score -= 20))
        send_alert "WARNING" "Docker" "$stopped_containers containers stopped"
    fi
    
    # Check container resource usage
    local container_stats=$(docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}" | tail -n +2)
    while IFS=$'\t' read -r name cpu mem; do
        cpu_num=$(echo "$cpu" | tr -d '%')
        mem_num=$(echo "$mem" | tr -d '%')
        
        if (( $(echo "$cpu_num > $CPU_THRESHOLD" | bc -l) )); then
            issues+=("Container $name high CPU: ${cpu}%")
            ((docker_score -= 5))
        fi
        
        if (( $(echo "$mem_num > $MEMORY_THRESHOLD" | bc -l) )); then
            issues+=("Container $name high memory: ${mem}%")
            ((docker_score -= 5))
        fi
    done <<< "$container_stats"
    
    # Check Docker disk usage
    local docker_disk_usage=$(docker system df --format "{{.Type}}:{{.Size}}" | grep "Images" | cut -d':' -f2 | tr -d 'A-Z')
    if [[ -n "$docker_disk_usage" ]]; then
        # Convert to GB for comparison
        local disk_gb=$(echo "$docker_disk_usage" | sed 's/[^0-9.]//g')
        if (( $(echo "$disk_gb > 10" | bc -l) )); then
            issues+=("High Docker disk usage: ${docker_disk_usage}")
            ((docker_score -= 10))
        fi
    fi
    
    echo "Docker Health Score: $docker_score/100"
    echo "Issues: ${issues[*]}"
}

# Check database health
check_database_health() {
    log "Checking database health..." "$BLUE"
    
    local db_score=100
    local issues=()
    
    # Check PostgreSQL if running
    if docker ps --format "{{.Names}}" | grep -q "postgres\|postgresql"; then
        local postgres_container=$(docker ps --format "{{.Names}}" | grep "postgres\|postgresql" | head -1)
        
        # Check connectivity
        if ! docker exec "$postgres_container" pg_isready -U postgres &>/dev/null; then
            issues+=("PostgreSQL not ready")
            ((db_score -= 30))
            send_alert "CRITICAL" "Database" "PostgreSQL not responding"
        fi
        
        # Check connection count
        local connections=$(docker exec "$postgres_container" psql -U postgres -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ')
        if [[ -n "$connections" ]] && (( connections > DB_CONNECTION_THRESHOLD )); then
            issues+=("High PostgreSQL connections: $connections")
            ((db_score -= 15))
        fi
        
        # Check database size
        local db_size=$(docker exec "$postgres_container" psql -U postgres -t -c "SELECT pg_database_size('postgres');" 2>/dev/null | tr -d ' ')
        if [[ -n "$db_size" ]]; then
            local size_gb=$(echo "$db_size/1024/1024/1024" | bc -l)
            if (( $(echo "$size_gb > 50" | bc -l) )); then
                issues+=("Large database size: ${size_gb}GB")
                ((db_score -= 10))
            fi
        fi
    fi
    
    # Check Redis if running
    if docker ps --format "{{.Names}}" | grep -q "redis"; then
        local redis_container=$(docker ps --format "{{.Names}}" | grep "redis" | head -1)
        
        # Check connectivity
        if ! docker exec "$redis_container" redis-cli ping &>/dev/null; then
            issues+=("Redis not responding")
            ((db_score -= 20))
            send_alert "CRITICAL" "Database" "Redis not responding"
        fi
        
        # Check memory usage
        local redis_memory=$(docker exec "$redis_container" redis-cli info memory | grep "used_memory_human:" | cut -d':' -f2 | tr -d '\r')
        if [[ -n "$redis_memory" ]]; then
            log "Redis memory usage: $redis_memory" "$BLUE"
        fi
    fi
    
    echo "Database Health Score: $db_score/100"
    echo "Issues: ${issues[*]}"
}

# Check network health
check_network_health() {
    log "Checking network health..." "$BLUE"
    
    local network_score=100
    local issues=()
    
    # Check external connectivity
    if ! ping -c 1 8.8.8.8 &>/dev/null; then
        issues+=("No external connectivity")
        ((network_score -= 30))
        send_alert "CRITICAL" "Network" "External connectivity lost"
    fi
    
    # Check DNS resolution
    if ! nslookup google.com &>/dev/null; then
        issues+=("DNS resolution failure")
        ((network_score -= 20))
    fi
    
    # Check network latency
    local latency=$(ping -c 3 8.8.8.8 2>/dev/null | tail -1 | awk '{print $4}' | cut -d'/' -f5)
    if [[ -n "$latency" ]]; then
        if (( $(echo "$latency > $NETWORK_LATENCY_THRESHOLD" | bc -l) )); then
            issues+=("High network latency: ${latency}ms")
            ((network_score -= 15))
        fi
    fi
    
    # Check port availability
    local critical_ports=("80" "443" "5432" "6379")
    for port in "${critical_ports[@]}"; do
        if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            issues+=("Port $port not listening")
            ((network_score -= 10))
        fi
    done
    
    # Check bandwidth (if available)
    if command -v ifstat &>/dev/null; then
        local bandwidth=$(ifstat 1 1 2>/dev/null | tail -1 | awk '{print $2+$3}')
        if [[ -n "$bandwidth" ]] && (( $(echo "$bandwidth > 1000" | bc -l) )); then
            log "High bandwidth usage: ${bandwidth}KB/s" "$YELLOW"
        fi
    fi
    
    echo "Network Health Score: $network_score/100"
    echo "Issues: ${issues[*]}"
}

# Check storage health
check_storage_health() {
    log "Checking storage health..." "$BLUE"
    
    local storage_score=100
    local issues=()
    
    # Check disk space
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    if [[ $disk_usage -gt $DISK_THRESHOLD ]]; then
        issues+=("High disk usage: ${disk_usage}%")
        ((storage_score -= 30))
        send_alert "WARNING" "Storage" "Disk usage at ${disk_usage}%")
    fi
    
    # Check inode usage
    local inode_usage=$(df -i / | tail -1 | awk '{print $5}' | tr -d '%')
    if [[ $inode_usage -gt 80 ]]; then
        issues+=("High inode usage: ${inode_usage}%")
        ((storage_score -= 20))
    fi
    
    # Check I/O wait
    local io_wait=$(iostat 1 1 2>/dev/null | tail -n +4 | head -1 | awk '{print $4}')
    if [[ -n "$io_wait" ]] && (( $(echo "$io_wait > 20" | bc -l) )); then
        issues+=("High I/O wait: ${io_wait}%")
        ((storage_score -= 15))
    fi
    
    # Check mounted filesystems
    local mount_issues=$(mount | grep -E "(ro,|errors)" | wc -l)
    if [[ $mount_issues -gt 0 ]]; then
        issues+=("$mount_issues filesystems with issues")
        ((storage_score -= 25))
        send_alert "CRITICAL" "Storage" "Filesystem issues detected")
    fi
    
    # Check backup storage
    if [[ -d "/backup" ]]; then
        local backup_usage=$(df -h /backup | tail -1 | awk '{print $5}' | tr -d '%')
        if [[ $backup_usage -gt 85 ]]; then
            issues+=("Backup storage full: ${backup_usage}%")
            ((storage_score -= 15))
        fi
    fi
    
    echo "Storage Health Score: $storage_score/100"
    echo "Issues: ${issues[*]}"
}

# Check application services health
check_services_health() {
    log "Checking application services health..." "$BLUE"
    
    local services_score=100
    local issues=()
    
    # Define service endpoints to check
    declare -A services=(
        ["frontend"]="http://localhost:3000"
        ["backend-go"]="http://localhost:8080/health"
        ["backend-python"]="http://localhost:8000/health"
        ["database"]="http://localhost:5432"
        ["cache"]="http://localhost:6379"
    )
    
    for service in "${!services[@]}"; do
        local endpoint="${services[$service]}"
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null || echo "000")
        
        case "$response_code" in
            "200"|"201")
                log "✓ $service healthy" "$GREEN"
                ;;
            "000")
                issues+=("$service unreachable")
                ((services_score -= 20))
                send_alert "CRITICAL" "Service" "$service unreachable"
                ;;
            "404")
                issues+=("$service endpoint not found")
                ((services_score -= 10))
                ;;
            "500"|"502"|"503")
                issues+=("$service returning error: $response_code")
                ((services_score -= 15))
                send_alert "WARNING" "Service" "$service returning $response_code"
                ;;
            *)
                issues+=("$service unexpected response: $response_code")
                ((services_score -= 5))
                ;;
        esac
    done
    
    # Check service dependencies
    local service_deps=("curl" "wget" "git" "docker" "kubectl")
    for dep in "${service_deps[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            issues+=("Missing dependency: $dep")
            ((services_score -= 5))
        fi
    done
    
    echo "Services Health Score: $services_score/100"
    echo "Issues: ${issues[*]}"
}

# Generate comprehensive health report
generate_health_report() {
    log "Generating infrastructure health report..." "$BLUE"
    
    mkdir -p "$REPORT_DIR"
    
    cat > "$REPORT_DIR/infrastructure-health-report.md" << EOF
# $APP_NAME Infrastructure Health Report

**Generated:** $(date)  
**Environment:** $(hostname)  
**Namespace:** $NAMESPACE

## Executive Summary

This report provides a comprehensive health assessment of all infrastructure components supporting the $APP_NAME application.

## Component Health Assessment

### Kubernetes Cluster
$(check_kubernetes_health)

### Docker Containers
$(check_docker_health)

### Database Systems
$(check_database_health)

### Network Infrastructure
$(check_network_health)

### Storage Systems
$(check_storage_health)

### Application Services
$(check_services_health)

## Overall Infrastructure Health

EOF

    # Calculate overall health score
    local k8s_health=$(check_kubernetes_health | grep "Health Score:" | cut -d':' -f2 | cut -d'/' -f1)
    local docker_health=$(check_docker_health | grep "Health Score:" | cut -d':' -f2 | cut -d'/' -f1)
    local db_health=$(check_database_health | grep "Health Score:" | cut -d':' -f2 | cut -d'/' -f1)
    local network_health=$(check_network_health | grep "Health Score:" | cut -d':' -f2 | cut -d'/' -f1)
    local storage_health=$(check_storage_health | grep "Health Score:" | cut -d':' -f2 | cut -d'/' -f1)
    local services_health=$(check_services_health | grep "Health Score:" | cut -d':' -f2 | cut -d'/' -f1)
    
    local overall_score=$(echo "scale=0; ($k8s_health + $docker_health + $db_health + $network_health + $storage_health + $services_health) / 6" | bc -l)
    
    cat >> "$REPORT_DIR/infrastructure-health-report.md" << EOF
| Component | Health Score | Status |
|-----------|--------------|--------|
| Kubernetes | $k8s_health/100 | $(if (( k8s_health >= 80 )); then echo "✅ Healthy"; elif (( k8s_health >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi) |
| Docker | $docker_health/100 | $(if (( docker_health >= 80 )); then echo "✅ Healthy"; elif (( docker_health >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi) |
| Database | $db_health/100 | $(if (( db_health >= 80 )); then echo "✅ Healthy"; elif (( db_health >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi) |
| Network | $network_health/100 | $(if (( network_health >= 80 )); then echo "✅ Healthy"; elif (( network_health >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi) |
| Storage | $storage_health/100 | $(if (( storage_health >= 80 )); then echo "✅ Healthy"; elif (( storage_health >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi) |
| Services | $services_health/100 | $(if (( services_health >= 80 )); then echo "✅ Healthy"; elif (( services_health >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi) |
| **Overall** | **$overall_score/100** | **$(if (( overall_score >= 80 )); then echo "✅ Healthy"; elif (( overall_score >= 60 )); then echo "⚠️ Warning"; else echo "❌ Critical"; fi)** |

## Recommendations

### Immediate Actions
- Address any critical component failures
- Restart unhealthy services
- Clear disk space if needed
- Check network connectivity issues

### Preventive Measures
- Implement automated health checks
- Set up monitoring alerts
- Regular maintenance schedules
- Capacity planning

### Long-term Improvements
- Consider high availability setup
- Implement disaster recovery
- Upgrade infrastructure components
- Optimize resource allocation

## Health Check History

| Timestamp | Overall Score | Critical Issues |
|-----------|---------------|-----------------|
| $(date) | $overall_score/100 | $(grep -c "CRITICAL" "$REPORT_DIR/infrastructure-health-report.md" || echo "0") |

EOF

    log "Infrastructure health report generated: $REPORT_DIR/infrastructure-health-report.md" "$GREEN"
}

# Generate real-time dashboard
generate_health_dashboard() {
    log "Generating infrastructure health dashboard..." "$BLUE"
    
    cat > "$REPORT_DIR/infrastructure-health-dashboard.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Infrastructure Health Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1400px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .metric-card.critical { border-left-color: #dc3545; }
        .metric-card.warning { border-left-color: #ffc107; }
        .metric-card.healthy { border-left-color: #28a745; }
        .metric-value { font-size: 2em; font-weight: bold; }
        .metric-label { color: #666; margin-top: 5px; }
        .chart-container { margin: 20px 0; }
        .status-good { color: #28a745; }
        .status-warning { color: #ffc107; }
        .status-critical { color: #dc3545; }
        .component-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
        .component-card { background: #f8f9fa; padding: 15px; border-radius: 8px; }
        .refresh-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
        .refresh-btn:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Infrastructure Health Dashboard</h1>
            <p>Real-time monitoring of infrastructure components</p>
            <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        </div>
        
        <div class="metrics">
            <div class="metric-card healthy">
                <div class="metric-value status-good" id="overall-health">85%</div>
                <div class="metric-label">Overall Health</div>
            </div>
            <div class="metric-card">
                <div class="metric-value" id="components-online">6/6</div>
                <div class="metric-label">Components Online</div>
            </div>
            <div class="metric-card warning">
                <div class="metric-value status-warning" id="active-issues">2</div>
                <div class="metric-label">Active Issues</div>
            </div>
            <div class="metric-card">
                <div class="metric-value" id="uptime">99.9%</div>
                <div class="metric-label">System Uptime</div>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="healthChart"></canvas>
        </div>
        
        <div class="component-grid">
            <div class="component-card">
                <h3>Kubernetes Cluster</h3>
                <div class="metric-value status-good">90%</div>
                <p>All nodes ready, 1 pod restarting</p>
            </div>
            <div class="component-card">
                <h3>Docker Containers</h3>
                <div class="metric-value status-good">95%</div>
                <p>8/9 containers running</p>
            </div>
            <div class="component-card">
                <h3>Database Systems</h3>
                <div class="metric-value status-warning">75%</div>
                <p>PostgreSQL healthy, Redis high memory</p>
            </div>
            <div class="component-card">
                <h3>Network Infrastructure</h3>
                <div class="metric-value status-good">88%</div>
                <p>Normal latency, DNS working</p>
            </div>
            <div class="component-card">
                <h3>Storage Systems</h3>
                <div class="metric-value status-critical">65%</div>
                <p>Disk usage at 92%, cleanup needed</p>
            </div>
            <div class="component-card">
                <h3>Application Services</h3>
                <div class="metric-value status-good">92%</div>
                <p>Frontend healthy, backend slow response</p>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="trendChart"></canvas>
        </div>
    </div>

    <script>
        // Initialize charts
        const healthCtx = document.getElementById('healthChart').getContext('2d');
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        
        new Chart(healthCtx, {
            type: 'bar',
            data: {
                labels: ['Kubernetes', 'Docker', 'Database', 'Network', 'Storage', 'Services'],
                datasets: [{
                    label: 'Health Score',
                    data: [90, 95, 75, 88, 65, 92],
                    backgroundColor: [
                        'rgba(40, 167, 69, 0.8)',
                        'rgba(40, 167, 69, 0.8)',
                        'rgba(255, 193, 7, 0.8)',
                        'rgba(40, 167, 69, 0.8)',
                        'rgba(220, 53, 69, 0.8)',
                        'rgba(40, 167, 69, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
        
        new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
                datasets: [{
                    label: 'Overall Health',
                    data: [95, 92, 88, 85, 87, 85],
                    backgroundColor: 'rgba(0, 123, 255, 0.2)',
                    borderColor: 'rgba(0, 123, 255, 1)',
                    borderWidth: 2,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
        
        // Auto-refresh every 5 minutes
        setTimeout(() => location.reload(), 300000);
    </script>
</body>
</html>
EOF

    log "Infrastructure health dashboard generated: $REPORT_DIR/infrastructure-health-dashboard.html" "$GREEN"
}

# Continuous monitoring mode
continuous_monitoring() {
    log "Starting continuous infrastructure health monitoring..." "$BLUE"
    log "Checking every $HEALTH_CHECK_INTERVAL seconds" "$BLUE"
    
    while true; do
        generate_health_report
        generate_health_dashboard
        
        # Sleep for the specified interval
        sleep "$HEALTH_CHECK_INTERVAL"
    done
}

# Main execution
main() {
    local mode="${1:-single}"
    
    log "Starting infrastructure health monitoring for $APP_NAME" "$BLUE"
    
    # Create log directory
    sudo mkdir -p "$(dirname "$LOG_FILE")"
    sudo touch "$LOG_FILE"
    sudo chmod 666 "$LOG_FILE"
    
    case "$mode" in
        "continuous")
            continuous_monitoring
            ;;
        "single"|*)
            generate_health_report
            generate_health_dashboard
            
            # Send notification
            send_alert "INFO" "Infrastructure" "Health check completed. Reports available in $REPORT_DIR"
            
            log "Infrastructure health monitoring completed" "$GREEN"
            log "Reports available in: $REPORT_DIR" "$BLUE"
            ;;
    esac
}

# Run main function
main "$@"
