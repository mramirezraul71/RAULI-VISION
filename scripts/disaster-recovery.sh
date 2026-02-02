#!/bin/bash

# 🆘 Disaster Recovery Script for RAULI-VISION
# Automated backup, restore, and disaster recovery procedures

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups/disaster-recovery"
RETENTION_DAYS=30
S3_BUCKET="${S3_BUCKET:-rauli-vision-backups}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
ENVIRONMENT="${ENVIRONMENT:-production}"

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

# Send notification
send_notification() {
    local message="$1"
    local severity="${2:-info}"
    
    log "📢 Sending notification: $message"
    
    # Slack notification
    if [ -n "$SLACK_WEBHOOK" ]; then
        local color="good"
        case "$severity" in
            "critical") color="danger" ;;
            "warning") color="warning" ;;
            "info") color="good" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\", \"color\":\"$color\"}" \
            "$SLACK_WEBHOOK" &>/dev/null || true
    fi
    
    # Email notification (if configured)
    if command -v mail &> /dev/null && [ -n "${ADMIN_EMAIL:-}" ]; then
        echo "$message" | mail -s "RAULI-VISION Disaster Recovery: $severity" "$ADMIN_EMAIL" || true
    fi
}

# Create backup directory
setup_backup() {
    mkdir -p "$BACKUP_DIR"
    log "💾 Backup directory: $BACKUP_DIR"
}

# Database backup
backup_database() {
    log "🗄️ Creating database backup..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/database_$timestamp.sql"
    
    # PostgreSQL backup
    if command -v pg_dump &> /dev/null; then
        pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > "$backup_file"
        
        # Compress backup
        gzip "$backup_file"
        backup_file="${backup_file}.gz"
        
        # Upload to S3
        if command -v aws &> /dev/null; then
            aws s3 cp "$backup_file" "s3://$S3_BUCKET/database/" || warning "Failed to upload to S3"
        fi
        
        success "✅ Database backup completed: $backup_file"
    else
        warning "⚠️ pg_dump not available, skipping database backup"
    fi
}

# Application backup
backup_application() {
    log "📦 Creating application backup..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local app_backup_dir="$BACKUP_DIR/application_$timestamp"
    
    mkdir -p "$app_backup_dir"
    
    # Backup source code
    if [ -d "./src" ]; then
        tar -czf "$app_backup_dir/source_code.tar.gz" ./src
    fi
    
    # Backup configuration files
    mkdir -p "$app_backup_dir/config"
    cp -r ./config "$app_backup_dir/" 2>/dev/null || true
    cp .env* "$app_backup_dir/config/" 2>/dev/null || true
    
    # Backup Docker images
    if command -v docker &> /dev/null; then
        docker save rauli-vision/frontend:latest | gzip > "$app_backup_dir/frontend_image.tar.gz" || true
        docker save rauli-vision/backend:latest | gzip > "$app_backup_dir/backend_image.tar.gz" || true
    fi
    
    # Backup Kubernetes manifests
    if [ -d "./k8s" ]; then
        cp -r ./k8s "$app_backup_dir/"
    fi
    
    # Backup Helm charts
    if [ -d "./helm" ]; then
        cp -r ./helm "$app_backup_dir/"
    fi
    
    # Create backup metadata
    cat > "$app_backup_dir/metadata.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "environment": "$ENVIRONMENT",
    "version": "$(git describe --tags --always 2>/dev/null || echo 'unknown')",
    "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "backup_type": "application"
}
EOF
    
    # Compress entire backup
    tar -czf "$BACKUP_DIR/application_$timestamp.tar.gz" -C "$BACKUP_DIR" "application_$timestamp"
    rm -rf "$app_backup_dir"
    
    # Upload to S3
    if command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_DIR/application_$timestamp.tar.gz" "s3://$S3_BUCKET/application/" || warning "Failed to upload to S3"
    fi
    
    success "✅ Application backup completed: application_$timestamp.tar.gz"
}

# User data backup
backup_user_data() {
    log "👥 Creating user data backup..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local user_backup_dir="$BACKUP_DIR/user_data_$timestamp"
    
    mkdir -p "$user_backup_dir"
    
    # Backup user uploads
    if [ -d "./uploads" ]; then
        tar -czf "$user_backup_dir/uploads.tar.gz" ./uploads
    fi
    
    # Backup user database (separate from main database)
    if command -v pg_dump &> /dev/null && [ -n "${USER_DB_NAME:-}" ]; then
        pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$USER_DB_NAME" > "$user_backup_dir/user_database.sql"
        gzip "$user_backup_dir/user_database.sql"
    fi
    
    # Backup analytics data
    if [ -d "./analytics" ]; then
        tar -czf "$user_backup_dir/analytics.tar.gz" ./analytics
    fi
    
    # Backup logs
    if [ -d "./logs" ]; then
        tar -czf "$user_backup_dir/logs.tar.gz" ./logs
    fi
    
    # Create metadata
    cat > "$user_backup_dir/metadata.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "environment": "$ENVIRONMENT",
    "backup_type": "user_data",
    "data_types": ["uploads", "user_database", "analytics", "logs"]
}
EOF
    
    # Compress backup
    tar -czf "$BACKUP_DIR/user_data_$timestamp.tar.gz" -C "$BACKUP_DIR" "user_data_$timestamp"
    rm -rf "$user_backup_dir"
    
    # Upload to S3
    if command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_DIR/user_data_$timestamp.tar.gz" "s3://$S3_BUCKET/user_data/" || warning "Failed to upload to S3"
    fi
    
    success "✅ User data backup completed: user_data_$timestamp.tar.gz"
}

# System state backup
backup_system_state() {
    log "⚙️ Creating system state backup..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local state_backup_dir="$BACKUP_DIR/system_state_$timestamp"
    
    mkdir -p "$state_backup_dir"
    
    # Backup Kubernetes state
    if command -v kubectl &> /dev/null; then
        # Get all resources
        kubectl get all -o yaml > "$state_backup_dir/k8s_resources.yaml" || true
        
        # Get secrets (encrypted)
        kubectl get secrets -o yaml > "$state_backup_dir/k8s_secrets.yaml" || true
        
        # Get configmaps
        kubectl get configmaps -o yaml > "$state_backup_dir/k8s_configmaps.yaml" || true
        
        # Get ingress
        kubectl get ingress -o yaml > "$state_backup_dir/k8s_ingress.yaml" || true
    fi
    
    # Backup Docker state
    if command -v docker &> /dev/null; then
        docker ps -a > "$state_backup_dir/docker_containers.txt"
        docker images > "$state_backup_dir/docker_images.txt"
        docker volume ls > "$state_backup_dir/docker_volumes.txt"
    fi
    
    # Backup system configuration
    if [ -f "/etc/hosts" ]; then
        cp /etc/hosts "$state_backup_dir/"
    fi
    
    # Backup network configuration
    if command -v ip &> /dev/null; then
        ip addr show > "$state_backup_dir/network_config.txt"
    fi
    
    # Create metadata
    cat > "$state_backup_dir/metadata.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "environment": "$ENVIRONMENT",
    "backup_type": "system_state",
    "hostname": "$(hostname)",
    "kernel": "$(uname -r)",
    "platform": "$(uname -s)"
}
EOF
    
    # Compress backup
    tar -czf "$BACKUP_DIR/system_state_$timestamp.tar.gz" -C "$BACKUP_DIR" "system_state_$timestamp"
    rm -rf "$state_backup_dir"
    
    # Upload to S3
    if command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_DIR/system_state_$timestamp.tar.gz" "s3://$S3_BUCKET/system_state/" || warning "Failed to upload to S3"
    fi
    
    success "✅ System state backup completed: system_state_$timestamp.tar.gz"
}

# Health check before backup
pre_backup_health_check() {
    log "🏥 Running pre-backup health check..."
    
    # Check application health
    if curl -f -s "$APP_URL/health" &> /dev/null; then
        success "✅ Application is healthy"
    else
        warning "⚠️ Application health check failed"
        return 1
    fi
    
    # Check database connectivity
    if command -v pg_isready &> /dev/null; then
        if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; then
            success "✅ Database is ready"
        else
            warning "⚠️ Database not ready"
            return 1
        fi
    fi
    
    # Check disk space
    local available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    local required_space=1048576 # 1GB in KB
    
    if [ "$available_space" -gt "$required_space" ]; then
        success "✅ Sufficient disk space available"
    else
        error "❌ Insufficient disk space"
        return 1
    fi
    
    success "✅ Pre-backup health check passed"
}

# Cleanup old backups
cleanup_old_backups() {
    log "🧹 Cleaning up old backups..."
    
    # Clean local backups
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
    
    # Clean S3 backups
    if command -v aws &> /dev/null; then
        aws s3 ls "s3://$S3_BUCKET/" | while read -r line; do
            local date_str=$(echo "$line" | awk '{print $1}')
            local file_name=$(echo "$line" | awk '{print $4}')
            
            if [ -n "$file_name" ]; then
                local file_date=$(date -d "$date_str" +%s 2>/dev/null || echo "0")
                local current_date=$(date +%s)
                local days_diff=$(( (current_date - file_date) / 86400 ))
                
                if [ "$days_diff" -gt "$RETENTION_DAYS" ]; then
                    aws s3 rm "s3://$S3_BUCKET/$file_name" || true
                fi
            fi
        done
    fi
    
    success "✅ Old backups cleaned up"
}

# Restore database
restore_database() {
    local backup_file="$1"
    
    log "🔄 Restoring database from: $backup_file"
    
    if [ ! -f "$backup_file" ]; then
        error "❌ Backup file not found: $backup_file"
        return 1
    fi
    
    # Download from S3 if needed
    if [[ "$backup_file" == s3://* ]]; then
        local local_file="/tmp/restore_$(basename "$backup_file")"
        aws s3 cp "$backup_file" "$local_file"
        backup_file="$local_file"
    fi
    
    # Extract if compressed
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" > /tmp/restore_database.sql
        backup_file="/tmp/restore_database.sql"
    fi
    
    # Restore database
    if command -v psql &> /dev/null; then
        psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" < "$backup_file"
        success "✅ Database restored successfully"
    else
        error "❌ psql not available for restore"
        return 1
    fi
    
    # Cleanup
    rm -f /tmp/restore_database.sql
    rm -f "$local_file"
}

# Restore application
restore_application() {
    local backup_file="$1"
    local restore_dir="$2"
    
    log "🔄 Restoring application from: $backup_file"
    
    if [ ! -f "$backup_file" ]; then
        error "❌ Backup file not found: $backup_file"
        return 1
    fi
    
    # Download from S3 if needed
    if [[ "$backup_file" == s3://* ]]; then
        local local_file="/tmp/restore_$(basename "$backup_file")"
        aws s3 cp "$backup_file" "$local_file"
        backup_file="$local_file"
    fi
    
    # Extract backup
    mkdir -p "$restore_dir"
    tar -xzf "$backup_file" -C "$restore_dir"
    
    # Restore source code
    if [ -f "$restore_dir/application_*/source_code.tar.gz" ]; then
        tar -xzf "$restore_dir/application_*/source_code.tar.gz" -C "$restore_dir"
    fi
    
    # Restore configuration
    if [ -d "$restore_dir/application_*/config" ]; then
        cp -r "$restore_dir/application_*/config/"* ./ 2>/dev/null || true
    fi
    
    # Restore Docker images
    if command -v docker &> /dev/null; then
        if [ -f "$restore_dir/application_*/frontend_image.tar.gz" ]; then
            gunzip -c "$restore_dir/application_*/frontend_image.tar.gz" | docker load || true
        fi
        if [ -f "$restore_dir/application_*/backend_image.tar.gz" ]; then
            gunzip -c "$restore_dir/application_*/backend_image.tar.gz" | docker load || true
        fi
    fi
    
    success "✅ Application restored successfully"
}

# Full disaster recovery
full_disaster_recovery() {
    local backup_date="$1"
    
    log "🆘 Starting full disaster recovery from: $backup_date"
    
    send_notification "🆘 Starting disaster recovery process" "critical"
    
    # Find backups for the specified date
    local database_backup=$(find "$BACKUP_DIR" -name "database_$backup_date*.sql.gz" | head -1)
    local application_backup=$(find "$BACKUP_DIR" -name "application_$backup_date*.tar.gz" | head -1)
    local user_data_backup=$(find "$BACKUP_DIR" -name "user_data_$backup_date*.tar.gz" | head -1)
    
    if [ -z "$database_backup" ] || [ -z "$application_backup" ]; then
        error "❌ Required backups not found for date: $backup_date"
        return 1
    fi
    
    # Stop services
    log "🛑 Stopping services..."
    if command -v docker-compose &> /dev/null; then
        docker-compose down || true
    fi
    
    if command -v kubectl &> /dev/null; then
        kubectl scale deployment --replicas=0 --all || true
    fi
    
    # Restore database
    restore_database "$database_backup"
    
    # Restore application
    restore_application "$application_backup" "./restore_temp"
    
    # Restore user data
    if [ -n "$user_data_backup" ]; then
        restore_application "$user_data_backup" "./restore_temp"
    fi
    
    # Start services
    log "🚀 Starting services..."
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d || true
    fi
    
    if command -v kubectl &> /dev/null; then
        kubectl scale deployment --replicas=1 --all || true
    fi
    
    # Wait for services to be ready
    log "⏳ Waiting for services to be ready..."
    sleep 30
    
    # Health check
    if curl -f -s "$APP_URL/health" &> /dev/null; then
        success "✅ Disaster recovery completed successfully"
        send_notification "✅ Disaster recovery completed successfully" "info"
    else
        error "❌ Disaster recovery failed - services not healthy"
        send_notification "❌ Disaster recovery failed" "critical"
        return 1
    fi
    
    # Cleanup
    rm -rf ./restore_temp
}

# Test backup integrity
test_backup_integrity() {
    log "🧪 Testing backup integrity..."
    
    local latest_backup=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_backup" ]; then
        warning "⚠️ No backups found to test"
        return 1
    fi
    
    # Test archive integrity
    if tar -tzf "$latest_backup" &> /dev/null; then
        success "✅ Backup archive integrity verified"
    else
        error "❌ Backup archive corrupted"
        return 1
    fi
    
    # Test metadata
    local temp_dir=$(mktemp -d)
    tar -xzf "$latest_backup" -C "$temp_dir"
    
    if [ -f "$temp_dir"/*/metadata.json" ]; then
        success "✅ Backup metadata verified"
    else
        warning "⚠️ Backup metadata missing"
    fi
    
    rm -rf "$temp_dir"
}

# Create disaster recovery plan
create_recovery_plan() {
    log "📋 Creating disaster recovery plan..."
    
    local plan_file="$BACKUP_DIR/disaster_recovery_plan.md"
    
    cat > "$plan_file" << EOF
# RAULI-VISION Disaster Recovery Plan

**Last Updated:** $(date)
**Environment:** $ENVIRONMENT

## 🆘 Emergency Contacts

- **DevOps Lead:** [Contact Information]
- **Engineering Manager:** [Contact Information]
- **System Administrator:** [Contact Information]
- **Database Administrator:** [Contact Information]

## 📊 Recovery Time Objectives (RTO)

- **Critical Systems:** 4 hours
- **Important Systems:** 8 hours
- **Non-Critical Systems:** 24 hours

## 📈 Recovery Point Objectives (RPO)

- **Database:** 1 hour
- **Application Code:** 24 hours
- **User Data:** 4 hours
- **Configuration:** 1 hour

## 🔄 Recovery Procedures

### 1. Assessment Phase (0-30 minutes)
- [ ] Identify the scope of the disaster
- [ ] Assess system damage
- [ ] Determine recovery priorities
- [ ] Notify stakeholders

### 2. Preparation Phase (30-60 minutes)
- [ ] Secure backup locations
- [ ] Prepare recovery environment
- [ ] Verify backup integrity
- [ ] Document recovery steps

### 3. Recovery Phase (1-4 hours)
- [ ] Restore infrastructure
- [ ] Restore databases
- [ ] Restore applications
- [ ] Restore user data

### 4. Verification Phase (4-5 hours)
- [ ] Test system functionality
- [ ] Verify data integrity
- [ ] Performance testing
- [ ] Security validation

### 5. Post-Recovery Phase (5-6 hours)
- [ ] Monitor system performance
- [ ] Document lessons learned
- [ ] Update recovery procedures
- [ ] Notify stakeholders

## 🗄️ Backup Locations

### Local Backups
- **Path:** $BACKUP_DIR
- **Retention:** $RETENTION_DAYS days
- **Frequency:** Daily

### Cloud Backups
- **Provider:** AWS S3
- **Bucket:** $S3_BUCKET
- **Retention:** 90 days
- **Frequency:** Daily

## 🛠️ Recovery Commands

### Database Recovery
\`\`\`bash
./scripts/disaster-recovery.sh restore-database <backup_file>
\`\`\`

### Application Recovery
\`\`\`bash
./scripts/disaster-recovery.sh restore-application <backup_file> <restore_dir>
\`\`\`

### Full Recovery
\`\`\`bash
./scripts/disaster-recovery.sh full-recovery <backup_date>
\`\`\`

## 📞 Communication Plan

### Internal Communication
- **Engineering Team:** Slack #disaster-recovery
- **Management:** Email and phone
- **Support Team:** Internal ticketing system

### External Communication
- **Customers:** Status page updates
- **Partners:** Direct email communication
- **Public:** Social media updates

## 🧪 Testing Schedule

- **Monthly:** Backup integrity tests
- **Quarterly:** Partial recovery tests
- **Annually:** Full disaster recovery drill

## 📊 Success Metrics

- **Recovery Time:** < 4 hours for critical systems
- **Data Loss:** < 1 hour of data
- **System Availability:** > 99.9%
- **User Satisfaction:** > 95%

## 🔄 Continuous Improvement

- **Post-Incident Reviews:** Within 48 hours
- **Procedure Updates:** Monthly
- **Training Sessions:** Quarterly
- **Tool Upgrades:** As needed

---

**Document Version:** 1.0
**Next Review Date:** $(date -d "+1 month" +%Y-%m-%d)
EOF
    
    success "✅ Disaster recovery plan created: $plan_file"
}

# Main execution
main() {
    local action="${1:-backup}"
    
    log "🆘 RAULI-VISION Disaster Recovery System"
    log "🎯 Action: $action"
    log "🌍 Environment: $ENVIRONMENT"
    
    case "$action" in
        "backup")
            setup_backup
            if pre_backup_health_check; then
                backup_database
                backup_application
                backup_user_data
                backup_system_state
                cleanup_old_backups
                success "🎉 Backup process completed successfully"
                send_notification "✅ Backup process completed successfully" "info"
            else
                error "❌ Pre-backup health check failed"
                send_notification "❌ Backup process failed" "critical"
                exit 1
            fi
            ;;
        "restore-database")
            restore_database "$2"
            ;;
        "restore-application")
            restore_application "$2" "$3"
            ;;
        "full-recovery")
            full_disaster_recovery "$2"
            ;;
        "test-integrity")
            test_backup_integrity
            ;;
        "create-plan")
            create_recovery_plan
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        *)
            echo "Usage: $0 {backup|restore-database|restore-application|full-recovery|test-integrity|create-plan|cleanup}"
            echo "  backup                    - Create full backup"
            echo "  restore-database <file>   - Restore database from backup"
            echo "  restore-application <file> <dir> - Restore application from backup"
            echo "  full-recovery <date>     - Full disaster recovery"
            echo "  test-integrity           - Test backup integrity"
            echo "  create-plan              - Create disaster recovery plan"
            echo "  cleanup                  - Clean up old backups"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
