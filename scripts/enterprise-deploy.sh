#!/bin/bash

# 🏢 Enterprise Deployment Script for RAULI-VISION
# Production-ready deployment with full CI/CD pipeline

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-production}"
NAMESPACE="rauli-vision-${ENVIRONMENT}"
HELM_CHART_PATH="./helm/rauli-vision"
RELEASE_NAME="rauli-vision-${ENVIRONMENT}"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Pre-deployment checks
pre_deploy_checks() {
    log "🔍 Running pre-deployment checks..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl not found"
    fi
    
    # Check helm
    if ! command -v helm &> /dev/null; then
        error "helm not found"
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster"
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        log "📝 Creating namespace: ${NAMESPACE}"
        kubectl create namespace "${NAMESPACE}"
    fi
    
    # Verify helm chart
    if ! helm lint "${HELM_CHART_PATH}" &> /dev/null; then
        error "Helm chart validation failed"
    fi
    
    success "✅ Pre-deployment checks passed"
}

# Security scanning
security_scan() {
    log "🔒 Running security scans..."
    
    # Trivy scan
    if command -v trivy &> /dev/null; then
        log "🔍 Running Trivy vulnerability scan..."
        trivy image --severity HIGH,CRITICAL "${IMAGE_NAME}:latest" || warning "Trivy scan found vulnerabilities"
    else
        warning "Trivy not installed, skipping security scan"
    fi
    
    # Check for secrets in git history
    if git log --all --full-history -- '*' | grep -i "password\|secret\|key\|token" &> /dev/null; then
        warning "Potential secrets found in git history"
    fi
    
    success "✅ Security scans completed"
}

# Backup current deployment
backup_deployment() {
    log "💾 Creating backup of current deployment..."
    
    BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "${BACKUP_DIR}"
    
    # Export current deployment
    if kubectl get deployment "${RELEASE_NAME}" -n "${NAMESPACE}" &> /dev/null; then
        kubectl get deployment "${RELEASE_NAME}" -n "${NAMESPACE}" -o yaml > "${BACKUP_DIR}/deployment.yaml"
    fi
    
    # Export secrets
    kubectl get secrets -n "${NAMESPACE}" -o yaml > "${BACKUP_DIR}/secrets.yaml"
    
    # Export configmaps
    kubectl get configmaps -n "${NAMESPACE}" -o yaml > "${BACKUP_DIR}/configmaps.yaml"
    
    success "✅ Backup created in ${BACKUP_DIR}"
}

# Deploy application
deploy_application() {
    log "🚀 Deploying RAULI-VISION to ${ENVIRONMENT}..."
    
    # Set environment-specific values
    VALUES_FILE="${HELM_CHART_PATH}/values.yaml"
    ENV_VALUES_FILE="${HELM_CHART_PATH}/values-${ENVIRONMENT}.yaml"
    
    HELM_ARGS=(
        "--namespace" "${NAMESPACE}"
        "--install"
        "--timeout" "10m"
        "--wait"
        "--atomic"
    )
    
    # Add environment-specific values if exists
    if [[ -f "${ENV_VALUES_FILE}" ]]; then
        HELM_ARGS+=("-f" "${ENV_VALUES_FILE}")
    fi
    
    # Add custom values
    HELM_ARGS+=(
        "-f" "${VALUES_FILE}"
        "--set" "image.tag=${IMAGE_TAG:-latest}"
        "--set" "environment=${ENVIRONMENT}"
    )
    
    # Deploy
    if helm upgrade "${RELEASE_NAME}" "${HELM_CHART_PATH}" "${HELM_ARGS[@]}"; then
        success "✅ Deployment successful"
    else
        error "❌ Deployment failed"
    fi
}

# Post-deployment verification
post_deploy_verification() {
    log "🔍 Running post-deployment verification..."
    
    # Wait for pods to be ready
    log "⏳ Waiting for pods to be ready..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=rauli-vision -n "${NAMESPACE}" --timeout=300s
    
    # Check pod status
    log "📊 Checking pod status..."
    kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=rauli-vision
    
    # Check services
    log "🔧 Checking services..."
    kubectl get services -n "${NAMESPACE}"
    
    # Check ingress
    if kubectl get ingress -n "${NAMESPACE}" &> /dev/null; then
        log "🌐 Checking ingress..."
        kubectl get ingress -n "${NAMESPACE}"
    fi
    
    # Run health checks
    log "🏥 Running health checks..."
    
    # Get application URL
    APP_URL=$(kubectl get ingress "${RELEASE_NAME}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "")
    
    if [[ -n "${APP_URL}" ]]; then
        log "🌐 Testing application at https://${APP_URL}"
        
        # Wait for DNS propagation
        sleep 30
        
        # Health check
        if curl -f -s "https://${APP_URL}/health" &> /dev/null; then
            success "✅ Health check passed"
        else
            error "❌ Health check failed"
        fi
    else
        warning "⚠️ No ingress found, skipping health check"
    fi
    
    success "✅ Post-deployment verification completed"
}

# Run smoke tests
run_smoke_tests() {
    log "🧪 Running smoke tests..."
    
    # Get application URL
    APP_URL=$(kubectl get ingress "${RELEASE_NAME}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "")
    
    if [[ -n "${APP_URL}" ]]; then
        # Test frontend
        log "📱 Testing frontend..."
        if curl -f -s "https://${APP_URL}/" &> /dev/null; then
            success "✅ Frontend test passed"
        else
            error "❌ Frontend test failed"
        fi
        
        # Test backend API
        log "🔥 Testing backend API..."
        if curl -f -s "https://${APP_URL}/api/health" &> /dev/null; then
            success "✅ Backend API test passed"
        else
            error "❌ Backend API test failed"
        fi
        
        # Test proxy
        log "🌐 Testing proxy..."
        if curl -f -s "https://${APP_URL}/api/search?q=test" &> /dev/null; then
            success "✅ Proxy test passed"
        else
            warning "⚠️ Proxy test failed (may be expected)"
        fi
    else
        warning "⚠️ No application URL found, skipping smoke tests"
    fi
    
    success "✅ Smoke tests completed"
}

# Update monitoring
update_monitoring() {
    log "📊 Updating monitoring configuration..."
    
    # Update Prometheus rules
    if kubectl get prometheusrules -n "${NAMESPACE}" &> /dev/null; then
        kubectl apply -f "./monitoring/prometheus-rules.yaml" -n "${NAMESPACE}"
    fi
    
    # Update Grafana dashboards
    if kubectl get configmaps -l grafana_dashboard=1 -n "${NAMESPACE}" &> /dev/null; then
        kubectl apply -f "./monitoring/grafana-dashboards.yaml" -n "${NAMESPACE}"
    fi
    
    success "✅ Monitoring updated"
}

# Send notifications
send_notifications() {
    log "📢 Sending deployment notifications..."
    
    # Slack notification (if webhook configured)
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚀 RAULI-VISION deployed to ${ENVIRONMENT} successfully\"}" \
            "${SLACK_WEBHOOK_URL}" &> /dev/null || warning "Failed to send Slack notification"
    fi
    
    # Email notification (if configured)
    if command -v mail &> /dev/null && [[ -n "${DEPLOYMENT_EMAIL:-}" ]]; then
        echo "RAULI-VISION deployed to ${ENVIRONMENT} successfully" | mail -s "Deployment Notification" "${DEPLOYMENT_EMAIL}" || warning "Failed to send email notification"
    fi
    
    success "✅ Notifications sent"
}

# Rollback function
rollback() {
    log "🔄 Rolling back deployment..."
    
    # Get previous revision
    PREVIOUS_REVISION=$(helm history "${RELEASE_NAME}" -n "${NAMESPACE}" -o json | jq -r '.[-2].revision')
    
    if [[ -n "${PREVIOUS_REVISION}" ]]; then
        if helm rollback "${RELEASE_NAME}" "${PREVIOUS_REVISION}" -n "${NAMESPACE}"; then
            success "✅ Rollback successful"
        else
            error "❌ Rollback failed"
        fi
    else
        error "❌ No previous revision found for rollback"
    fi
}

# Main execution
main() {
    log "🏢 Starting Enterprise Deployment of RAULI-VISION"
    log "📊 Environment: ${ENVIRONMENT}"
    log "📦 Namespace: ${NAMESPACE}"
    
    # Trap for cleanup
    trap 'error "Deployment interrupted"' INT TERM
    
    # Execute deployment pipeline
    pre_deploy_checks
    security_scan
    backup_deployment
    deploy_application
    post_deploy_verification
    run_smoke_tests
    update_monitoring
    send_notifications
    
    success "🎉 Enterprise deployment completed successfully!"
    
    # Display deployment information
    echo
    log "📋 Deployment Information:"
    echo "  Namespace: ${NAMESPACE}"
    echo "  Release: ${RELEASE_NAME}"
    echo "  Environment: ${ENVIRONMENT}"
    
    APP_URL=$(kubectl get ingress "${RELEASE_NAME}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "")
    if [[ -n "${APP_URL}" ]]; then
        echo "  Application URL: https://${APP_URL}"
    fi
    
    echo
    log "🔗 Useful Commands:"
    echo "  kubectl get pods -n ${NAMESPACE}"
    echo "  kubectl logs -f deployment/${RELEASE_NAME} -n ${NAMESPACE}"
    echo "  helm status ${RELEASE_NAME} -n ${NAMESPACE}"
    echo "  ./scripts/enterprise-deploy.sh rollback"
}

# Handle rollback command
if [[ "${1:-}" == "rollback" ]]; then
    rollback
    exit 0
fi

# Execute main function
main "$@"
