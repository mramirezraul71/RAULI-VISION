#!/bin/bash

# RAULI-VISION Automated Scaling Script
# Implements intelligent auto-scaling based on metrics, load, and business rules
# Supports Kubernetes HPA, Docker Swarm, and cloud provider auto-scaling

set -euo pipefail

# Configuration
APP_NAME="${APP_NAME:-RAULI-VISION}"
NAMESPACE="${NAMESPACE:-default}"
LOG_FILE="/var/log/rauli-vision/automated-scaling.log"
SCALING_POLICY_FILE="config/scaling-policy.json"
METRICS_RETENTION_HOURS="${METRICS_RETENTION_HOURS:-24}"
COOLDOWN_PERIOD="${COOLDOWN_PERIOD:-300}" # 5 minutes

# Scaling thresholds
CPU_SCALE_UP_THRESHOLD="${CPU_SCALE_UP_THRESHOLD:-70}"
CPU_SCALE_DOWN_THRESHOLD="${CPU_SCALE_DOWN_THRESHOLD:-30}"
MEMORY_SCALE_UP_THRESHOLD="${MEMORY_SCALE_UP_THRESHOLD:-80}"
MEMORY_SCALE_DOWN_THRESHOLD="${MEMORY_SCALE_DOWN_THRESHOLD:-40}"
RESPONSE_TIME_SCALE_UP_THRESHOLD="${RESPONSE_TIME_SCALE_UP_THRESHOLD:-500}"
REQUEST_RATE_SCALE_UP_THRESHOLD="${REQUEST_RATE_SCALE_UP_THRESHOLD:-1000}"

# Scaling limits
MIN_REPLICAS="${MIN_REPLICAS:-1}"
MAX_REPLICAS="${MAX_REPLICAS:-10}"
SCALE_UP_STEP="${SCALE_UP_STEP:-1}"
SCALE_DOWN_STEP="${SCALE_DOWN_STEP:-1}"

# Cloud provider settings
CLOUD_PROVIDER="${CLOUD_PROVIDER:-aws}"
AWS_REGION="${AWS_REGION:-us-east-1}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
AZURE_REGION="${AZURE_REGION:-eastus}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${2}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

# Send scaling notification
send_scaling_notification() {
    local action="$1"
    local component="$2"
    local from_replicas="$3"
    local to_replicas="$4"
    local reason="$5"
    
    local message="🔧 Scaling $action: $component scaled from $from_replicas to $to_replicas replicas"
    message="$message\nReason: $reason"
    
    if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$APP_NAME Auto-Scaling: $message\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
    
    if [[ -n "${ALERT_EMAIL:-}" ]]; then
        echo -e "$message" | mail -s "$APP_NAME Auto-Scaling Notification" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    log "SCALING NOTIFICATION: $message" "$CYAN"
}

# Check cooldown period
check_cooldown() {
    local component="$1"
    local last_scale_file="/tmp/.last_scale_${component}"
    
    if [[ -f "$last_scale_file" ]]; then
        local last_scale_time=$(cat "$last_scale_file")
        local current_time=$(date +%s)
        local time_diff=$((current_time - last_scale_time))
        
        if [[ $time_diff -lt $COOLDOWN_PERIOD ]]; then
            local remaining=$((COOLDOWN_PERIOD - time_diff))
            log "Cooldown active for $component. $remaining seconds remaining." "$YELLOW"
            return 1
        fi
    fi
    
    echo "$(date +%s)" > "$last_scale_file"
    return 0
}

# Collect current metrics
collect_metrics() {
    log "Collecting current metrics..." "$BLUE"
    
    local metrics_file="/tmp/current_metrics.json"
    
    # Kubernetes metrics
    if command -v kubectl &>/dev/null && kubectl cluster-info &>/dev/null; then
        local k8s_metrics=$(kubectl top pods --namespace="$NAMESPACE" --no-headers 2>/dev/null | awk '
        {
            pod_name = $1;
            cpu_usage = $2;
            mem_usage = $3;
            gsub(/[^0-9.]/, "", cpu_usage);
            gsub(/[^0-9.]/, "", mem_usage);
            print "\"" pod_name "\": {\"cpu\": " cpu_usage ", \"memory\": " mem_usage "}";
        }' | tr '\n' ',' | sed 's/,$//')
        
        echo "\"kubernetes\": {${k8s_metrics}}" > "$metrics_file.tmp"
    fi
    
    # Docker metrics
    if command -v docker &>/dev/null; then
        local docker_metrics=$(docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}" | tail -n +2 | awk '
        {
            name = $1;
            cpu = $2;
            mem = $3;
            gsub(/%/, "", cpu);
            gsub(/%/, "", mem);
            print "\"" name "\": {\"cpu\": " cpu ", \"memory\": " mem "}";
        }' | tr '\n' ',' | sed 's/,$//')
        
        echo "\"docker\": {${docker_metrics}}" >> "$metrics_file.tmp"
    fi
    
    # Application metrics
    local app_metrics="\"application\": {"
    
    # Response time
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' "http://localhost:8080/health" 2>/dev/null || echo "0")
    app_metrics="$app_metrics \"response_time\": $response_time,"
    
    # Request rate (approximate)
    local request_rate=$(curl -s "http://localhost:8080/metrics" 2>/dev/null | grep "http_requests_total" | tail -1 | awk '{print $2}' || echo "0")
    app_metrics="$app_metrics \"request_rate\": $request_rate,"
    
    # Active connections
    local active_connections=$(netstat -an | grep ":8080.*ESTABLISHED" | wc -l)
    app_metrics="$app_metrics \"active_connections\": $active_connections"
    
    app_metrics="$app_metrics}"
    echo "$app_metrics" >> "$metrics_file.tmp"
    
    # System metrics
    local system_metrics="\"system\": {"
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | tr -d '%us,')
    system_metrics="$system_metrics \"cpu_usage\": $cpu_usage,"
    
    # Memory usage
    local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    system_metrics="$system_metrics \"memory_usage\": $memory_usage,"
    
    # Load average
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | tr -d ' ')
    system_metrics="$system_metrics \"load_average\": $load_avg,"
    
    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
    system_metrics="$system_metrics \"disk_usage\": $disk_usage"
    
    system_metrics="$system_metrics}"
    echo "$system_metrics" >> "$metrics_file.tmp"
    
    # Combine all metrics
    echo "{" > "$metrics_file"
    cat "$metrics_file.tmp" >> "$metrics_file"
    echo "}" >> "$metrics_file"
    
    rm -f "$metrics_file.tmp"
    log "Metrics collected: $metrics_file" "$GREEN"
    echo "$metrics_file"
}

# Analyze scaling decisions
analyze_scaling_decisions() {
    local metrics_file="$1"
    local decisions_file="/tmp/scaling_decisions.json"
    
    log "Analyzing scaling decisions..." "$BLUE"
    
    # Parse metrics and make decisions
    local decisions="{\"decisions\": ["
    local first_decision=true
    
    # Kubernetes deployments analysis
    if command -v kubectl &>/dev/null; then
        local deployments=$(kubectl get deployments --namespace="$NAMESPACE" --no-headers | awk '{print $1}')
        
        for deployment in $deployments; do
            local current_replicas=$(kubectl get deployment "$deployment" --namespace="$NAMESPACE" -o jsonpath='{.spec.replicas}')
            local cpu_metric=$(jq -r ".kubernetes.\"$deployment\".cpu // 0" "$metrics_file")
            local memory_metric=$(jq -r ".kubernetes.\"$deployment\".memory // 0" "$metrics_file")
            
            local action="none"
            local reason=""
            local target_replicas=$current_replicas
            
            # Scale up decisions
            if (( $(echo "$cpu_metric > $CPU_SCALE_UP_THRESHOLD" | bc -l) )); then
                action="scale_up"
                reason="CPU usage ${cpu_metric}% exceeds threshold ${CPU_SCALE_UP_THRESHOLD}%"
                target_replicas=$((current_replicas + SCALE_UP_STEP))
            elif (( $(echo "$memory_metric > $MEMORY_SCALE_UP_THRESHOLD" | bc -l) )); then
                action="scale_up"
                reason="Memory usage ${memory_metric}% exceeds threshold ${MEMORY_SCALE_UP_THRESHOLD}%"
                target_replicas=$((current_replicas + SCALE_UP_STEP))
            fi
            
            # Scale down decisions
            if [[ "$action" == "none" ]]; then
                if (( $(echo "$cpu_metric < $CPU_SCALE_DOWN_THRESHOLD" | bc -l) )) && (( $(echo "$memory_metric < $MEMORY_SCALE_DOWN_THRESHOLD" | bc -l) )); then
                    if [[ $current_replicas -gt $MIN_REPLICAS ]]; then
                        action="scale_down"
                        reason="CPU ${cpu_metric}% and Memory ${memory_metric}% below thresholds"
                        target_replicas=$((current_replicas - SCALE_DOWN_STEP))
                    fi
                fi
            fi
            
            # Enforce limits
            if [[ $target_replicas -lt $MIN_REPLICAS ]]; then
                target_replicas=$MIN_REPLICAS
                action="none"
                reason="Would exceed minimum replicas limit"
            elif [[ $target_replicas -gt $MAX_REPLICAS ]]; then
                target_replicas=$MAX_REPLICAS
                action="none"
                reason="Would exceed maximum replicas limit"
            fi
            
            # Add decision if action is not none
            if [[ "$action" != "none" ]]; then
                if [[ "$first_decision" == "true" ]]; then
                    first_decision=false
                else
                    decisions="$decisions,"
                fi
                
                decisions="$decisions{
                    \"component\": \"$deployment\",
                    \"type\": \"kubernetes_deployment\",
                    \"action\": \"$action\",
                    \"current_replicas\": $current_replicas,
                    \"target_replicas\": $target_replicas,
                    \"reason\": \"$reason\",
                    \"metrics\": {
                        \"cpu\": $cpu_metric,
                        \"memory\": $memory_metric
                    }
                }"
            fi
        done
    fi
    
    # Docker services analysis
    if command -v docker &>/dev/null; then
        local services=$(docker service ls --format "{{.Name}}" 2>/dev/null || docker ps --format "{{.Names}}")
        
        for service in $services; do
            local current_tasks=$(docker service ls --filter "name=$service" --format "{{.Replicas}}" 2>/dev/null | cut -d'/' -f1 || echo "1")
            local cpu_metric=$(jq -r ".docker.\"$service\".cpu // 0" "$metrics_file")
            local memory_metric=$(jq -r ".docker.\"$service\".memory // 0" "$metrics_file")
            
            # Similar decision logic as Kubernetes
            local action="none"
            local reason=""
            local target_tasks=$current_tasks
            
            if (( $(echo "$cpu_metric > $CPU_SCALE_UP_THRESHOLD" | bc -l) )); then
                action="scale_up"
                reason="CPU usage ${cpu_metric}% exceeds threshold"
                target_tasks=$((current_tasks + SCALE_UP_STEP))
            elif (( $(echo "$cpu_metric < $CPU_SCALE_DOWN_THRESHOLD" | bc -l) )) && [[ $current_tasks -gt $MIN_REPLICAS ]]; then
                action="scale_down"
                reason="CPU usage ${cpu_metric}% below threshold"
                target_tasks=$((current_tasks - SCALE_UP_STEP))
            fi
            
            if [[ "$action" != "none" ]]; then
                if [[ "$first_decision" == "true" ]]; then
                    first_decision=false
                else
                    decisions="$decisions,"
                fi
                
                decisions="$decisions{
                    \"component\": \"$service\",
                    \"type\": \"docker_service\",
                    \"action\": \"$action\",
                    \"current_replicas\": $current_tasks,
                    \"target_replicas\": $target_tasks,
                    \"reason\": \"$reason\",
                    \"metrics\": {
                        \"cpu\": $cpu_metric,
                        \"memory\": $memory_metric
                    }
                }"
            fi
        done
    fi
    
    decisions="$decisions]}"
    echo "$decisions" > "$decisions_file"
    
    log "Scaling decisions analyzed: $decisions_file" "$GREEN"
    echo "$decisions_file"
}

# Execute scaling actions
execute_scaling_actions() {
    local decisions_file="$1"
    
    log "Executing scaling actions..." "$BLUE"
    
    local decisions_count=$(jq '.decisions | length' "$decisions_file")
    
    if [[ $decisions_count -eq 0 ]]; then
        log "No scaling actions required" "$GREEN"
        return
    fi
    
    log "Processing $decisions_count scaling decisions..." "$YELLOW"
    
    for ((i=0; i<decisions_count; i++)); do
        local decision=$(jq ".decisions[$i]" "$decisions_file")
        local component=$(echo "$decision" | jq -r '.component')
        local action=$(echo "$decision" | jq -r '.action')
        local type=$(echo "$decision" | jq -r '.type')
        local current_replicas=$(echo "$decision" | jq -r '.current_replicas')
        local target_replicas=$(echo "$decision" | jq -r '.target_replicas')
        local reason=$(echo "$decision" | jq -r '.reason')
        
        # Check cooldown
        if ! check_cooldown "$component"; then
            log "Skipping scaling for $component due to cooldown" "$YELLOW"
            continue
        fi
        
        log "Executing $action for $component ($type): $current_replicas -> $target_replicas" "$BLUE"
        log "Reason: $reason" "$BLUE"
        
        case "$type" in
            "kubernetes_deployment")
                if command -v kubectl &>/dev/null; then
                    if kubectl scale deployment "$component" --namespace="$NAMESPACE" --replicas="$target_replicas" &>/dev/null; then
                        send_scaling_notification "$action" "$component" "$current_replicas" "$target_replicas" "$reason"
                        log "✓ Kubernetes deployment $component scaled successfully" "$GREEN"
                    else
                        log "✗ Failed to scale Kubernetes deployment $component" "$RED"
                    fi
                fi
                ;;
            "docker_service")
                if command -v docker &>/dev/null; then
                    if docker service scale "$component=$target_replicas" &>/dev/null; then
                        send_scaling_notification "$action" "$component" "$current_replicas" "$target_replicas" "$reason"
                        log "✓ Docker service $component scaled successfully" "$GREEN"
                    else
                        log "✗ Failed to scale Docker service $component" "$RED"
                    fi
                fi
                ;;
        esac
    done
}

# Cloud provider auto-scaling integration
setup_cloud_auto_scaling() {
    log "Setting up cloud provider auto-scaling..." "$BLUE"
    
    case "$CLOUD_PROVIDER" in
        "aws")
            setup_aws_auto_scaling
            ;;
        "gcp")
            setup_gcp_auto_scaling
            ;;
        "azure")
            setup_azure_auto_scaling
            ;;
        *)
            log "Cloud provider $CLOUD_PROVIDER not supported for auto-scaling" "$YELLOW"
            ;;
    esac
}

# AWS Auto Scaling setup
setup_aws_auto_scaling() {
    log "Configuring AWS Auto Scaling..." "$BLUE"
    
    # Create scaling policy
    local policy_name="$APP_NAME-scaling-policy"
    
    if command -v aws &>/dev/null; then
        # Create target tracking scaling policy
        aws application-autoscaling put-scaling-policy \
            --service-namespace ecs \
            --resource-id "service/$AWS_CLUSTER/$APP_NAME" \
            --scalable-dimension ecs:service:DesiredCount \
            --policy-name "$policy_name" \
            --policy-type TargetTrackingScaling \
            --target-tracking-scaling-policy-configuration file://<(cat <<EOF
{
  "TargetValue": $CPU_SCALE_UP_THRESHOLD,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleInCooldown": $COOLDOWN_PERIOD,
  "ScaleOutCooldown": $COOLDOWN_PERIOD
}
EOF
) 2>/dev/null && log "✓ AWS auto-scaling policy created" "$GREEN" || log "✗ Failed to create AWS auto-scaling policy" "$RED"
    fi
}

# GCP Auto Scaling setup
setup_gcp_auto_scaling() {
    log "Configuring GCP Auto Scaling..." "$BLUE"
    
    if command -v gcloud &>/dev/null; then
        # Create managed instance group with auto-scaling
        gcloud compute instance-groups managed create "$APP_NAME-mig" \
            --zone="$GCP_ZONE" \
            --template="$APP_NAME-template" \
            --size="$MIN_REPLICAS" \
            --quiet 2>/dev/null && log "✓ GCP managed instance group created" "$GREEN" || log "✗ Failed to create GCP managed instance group" "$RED"
        
        # Configure auto-scaling
        gcloud compute instance-groups managed set-autoscaling "$APP_NAME-mig" \
            --zone="$GCP_ZONE" \
            --max-num-replicas="$MAX_REPLICAS" \
            --target-cpu-utilization="$CPU_SCALE_UP_THRESHOLD" \
            --cool-down-period="$COOLDOWN_PERIOD" \
            --quiet 2>/dev/null && log "✓ GCP auto-scaling configured" "$GREEN" || log "✗ Failed to configure GCP auto-scaling" "$RED"
    fi
}

# Azure Auto Scaling setup
setup_azure_auto_scaling() {
    log "Configuring Azure Auto Scaling..." "$BLUE"
    
    if command -v az &>/dev/null; then
        # Create scale set
        az vmss create \
            --resource-group "$APP_NAME-rg" \
            --name "$APP_NAME-vmss" \
            --image UbuntuLTS \
            --admin-username "azureuser" \
            --generate-ssh-keys \
            --instance-count "$MIN_REPLICAS" \
            --quiet 2>/dev/null && log "✓ Azure VM scale set created" "$GREEN" || log "✗ Failed to create Azure VM scale set" "$RED"
        
        # Configure auto-scaling
        az monitor autoscale create \
            --resource-group "$APP_NAME-rg" \
            --resource "$APP_NAME-vmss" \
            --resource-type Microsoft.Compute/virtualMachineScaleSets \
            --min-count "$MIN_REPLICAS" \
            --max-count "$MAX_REPLICAS" \
            --count "$MIN_REPLICAS" \
            --quiet 2>/dev/null && log "✓ Azure auto-scaling created" "$GREEN" || log "✗ Failed to create Azure auto-scaling" "$RED"
    fi
}

# Generate scaling report
generate_scaling_report() {
    local metrics_file="$1"
    local decisions_file="$2"
    local report_dir="reports/scaling-$(date +%Y%m%d-%H%M%S)"
    
    log "Generating scaling report..." "$BLUE"
    
    mkdir -p "$report_dir"
    
    cat > "$report_dir/scaling-report.md" << EOF
# $APP_NAME Auto-Scaling Report

**Generated:** $(date)  
**Environment:** $(hostname)  
**Namespace:** $NAMESPACE

## Current Metrics

$(cat "$metrics_file" | jq -r 'to_entries[] | "\(.key):\n\(.value | to_entries[] | "  \(.key): \(.value)")"')

## Scaling Decisions

$(cat "$decisions_file" | jq -r '.decisions[] | "- **\(.component)** (\(.type)): \(.action) from \(.current_replicas) to \(.target_replicas) replicas\n  Reason: \(.reason)\n  Metrics: CPU \(.metrics.cpu)%, Memory \(.metrics.memory)%\n"')

## Scaling Configuration

| Parameter | Value |
|-----------|-------|
| CPU Scale Up Threshold | $CPU_SCALE_UP_THRESHOLD% |
| CPU Scale Down Threshold | $CPU_SCALE_DOWN_THRESHOLD% |
| Memory Scale Up Threshold | $MEMORY_SCALE_UP_THRESHOLD% |
| Memory Scale Down Threshold | $MEMORY_SCALE_DOWN_THRESHOLD% |
| Min Replicas | $MIN_REPLICAS |
| Max Replicas | $MAX_REPLICAS |
| Scale Up Step | $SCALE_UP_STEP |
| Scale Down Step | $SCALE_DOWN_STEP |
| Cooldown Period | ${COOLDOWN_PERIOD}s |

## Scaling History

| Timestamp | Component | Action | From | To | Reason |
|-----------|-----------|--------|------|----|--------|
| $(date) | - | - | - | - | Report generated |

## Recommendations

### Immediate Actions
- Review any failed scaling operations
- Adjust thresholds if scaling is too frequent or insufficient
- Check resource limits if scaling is constrained

### Optimization Opportunities
- Consider predictive scaling based on traffic patterns
- Implement custom metrics for business-specific scaling
- Use different scaling policies for different components

### Long-term Improvements
- Implement machine learning for predictive scaling
- Set up multi-cloud auto-scaling for redundancy
- Create cost optimization strategies for scaling

EOF

    log "Scaling report generated: $report_dir/scaling-report.md" "$GREEN"
    echo "$report_dir"
}

# Main execution
main() {
    local mode="${1:-manual}"
    
    log "Starting automated scaling for $APP_NAME" "$BLUE"
    
    # Create log directory
    sudo mkdir -p "$(dirname "$LOG_FILE")"
    sudo touch "$LOG_FILE"
    sudo chmod 666 "$LOG_FILE"
    
    # Create config directory
    mkdir -p "$(dirname "$SCALING_POLICY_FILE")"
    
    case "$mode" in
        "setup")
            setup_cloud_auto_scaling
            ;;
        "continuous")
            log "Starting continuous auto-scaling monitoring..." "$BLUE"
            
            while true; do
                local metrics_file=$(collect_metrics)
                local decisions_file=$(analyze_scaling_decisions "$metrics_file")
                execute_scaling_actions "$decisions_file"
                
                # Clean up old metrics
                find /tmp -name "current_metrics.json" -mtime +1 -delete 2>/dev/null || true
                find /tmp -name "scaling_decisions.json" -mtime +1 -delete 2>/dev/null || true
                
                sleep 60 # Check every minute
            done
            ;;
        "manual"|*)
            local metrics_file=$(collect_metrics)
            local decisions_file=$(analyze_scaling_decisions "$metrics_file")
            execute_scaling_actions "$decisions_file"
            local report_dir=$(generate_scaling_report "$metrics_file" "$decisions_file")
            
            log "Auto-scaling completed" "$GREEN"
            log "Report available in: $report_dir" "$BLUE"
            ;;
    esac
}

# Run main function
main "$@"
