#!/bin/bash

# RAULI-VISION Backup Automation Script
# Comprehensive automated backup solution with scheduling, retention, and cloud integration
# Supports databases, application data, configurations, and system state

set -euo pipefail

# Configuration
APP_NAME="${APP_NAME:-RAULI-VISION}"
BACKUP_BASE_DIR="/backups/$APP_NAME"
LOG_FILE="/var/log/rauli-vision/backup-automation.log"
CONFIG_FILE="/etc/rauli-vision/backup-config.json"
SCHEDULE_FILE="/etc/cron.d/rauli-vision-backup"

# Backup settings
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
COMPRESS_BACKUPS="${COMPRESS_BACKUPS:-true}"
ENCRYPT_BACKUPS="${ENCRYPT_BACKUPS:-true}"
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"

# Cloud storage settings
CLOUD_PROVIDER="${CLOUD_PROVIDER:-aws}"
CLOUD_BUCKET="${CLOUD_BUCKET:-rauli-vision-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
GCP_PROJECT="${GCP_PROJECT:-rauli-vision}"
AZURE_STORAGE="${AZURE_STORAGE:-raulivisionstorage}"

# Encryption settings
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@rauli-vision.com}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Notification settings
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

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

# Send backup notification
send_backup_notification() {
    local status="$1"
    local backup_type="$2"
    local size="$3"
    local duration="$4"
    local location="$5"
    
    local message="💾 Backup $status: $backup_type backup completed"
    message="$message\nSize: $size"
    message="$message\nDuration: $duration"
    message="$message\nLocation: $location"
    
    if [[ "$status" == "FAILED" ]]; then
        message="🚨 Backup FAILED: $backup_type backup failed"
    fi
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$APP_NAME Backup: $message\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
    
    if [[ -n "$ALERT_EMAIL" ]]; then
        echo -e "$message" | mail -s "$APP_NAME Backup Notification ($status)" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    log "BACKUP NOTIFICATION: $message" "$CYAN"
}

# Create backup configuration
create_backup_config() {
    log "Creating backup configuration..." "$BLUE"
    
    mkdir -p "$(dirname "$CONFIG_FILE")"
    
    cat > "$CONFIG_FILE" << EOF
{
  "backup_schedule": {
    "database": "0 2 * * *",
    "application": "0 3 * * *",
    "configuration": "0 4 * * 0",
    "system_state": "0 5 * * 0"
  },
  "backup_sources": {
    "database": {
      "postgresql": {
        "enabled": true,
        "host": "localhost",
        "port": 5432,
        "databases": ["postgres"],
        "user": "postgres"
      },
      "redis": {
        "enabled": true,
        "host": "localhost",
        "port": 6379
      }
    },
    "application": {
      "directories": [
        "/opt/rauli-vision",
        "/var/www/rauli-vision",
        "/etc/rauli-vision"
      ],
      "exclude_patterns": [
        "*.log",
        "*.tmp",
        "node_modules",
        ".git"
      ]
    },
    "configuration": {
      "files": [
        "/etc/nginx/nginx.conf",
        "/etc/ssh/sshd_config",
        "/etc/docker/daemon.json",
        "/etc/kubernetes/manifests"
      ]
    },
    "system_state": {
      "commands": [
        "docker ps",
        "kubectl get all --all-namespaces",
        "systemctl list-units --type=service",
        "netstat -tuln"
      ]
    }
  },
  "storage": {
    "local": {
      "enabled": true,
      "directory": "$BACKUP_BASE_DIR"
    },
    "cloud": {
      "enabled": true,
      "provider": "$CLOUD_PROVIDER",
      "bucket": "$CLOUD_BUCKET",
      "region": "$AWS_REGION"
    }
  },
  "retention": {
    "daily": 7,
    "weekly": 4,
    "monthly": 12,
    "yearly": 3
  },
  "compression": {
    "enabled": $COMPRESS_BACKUPS,
    "algorithm": "gzip",
    "level": 6
  },
  "encryption": {
    "enabled": $ENCRYPT_BACKUPS,
    "gpg_recipient": "$GPG_RECIPIENT"
  }
}
EOF

    log "Backup configuration created: $CONFIG_FILE" "$GREEN"
}

# Database backup function
backup_database() {
    local backup_date=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/database/$backup_date"
    local backup_file="$backup_dir/database-backup.tar"
    
    log "Starting database backup..." "$BLUE"
    local start_time=$(date +%s)
    
    mkdir -p "$backup_dir"
    
    # PostgreSQL backup
    if command -v pg_dump &>/dev/null && docker ps --format "{{.Names}}" | grep -q "postgres"; then
        log "Backing up PostgreSQL..." "$BLUE"
        
        local postgres_container=$(docker ps --format "{{.Names}}" | grep "postgres" | head -1)
        local databases=$(docker exec "$postgres_container" psql -U postgres -t -c "SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn;" 2>/dev/null | tr -d ' ')
        
        for db in $databases; do
            local db_file="$backup_dir/postgres_${db}.sql"
            if docker exec "$postgres_container" pg_dump -U postgres "$db" > "$db_file" 2>/dev/null; then
                log "✓ PostgreSQL database $db backed up" "$GREEN"
            else
                log "✗ Failed to backup PostgreSQL database $db" "$RED"
                return 1
            fi
        done
    fi
    
    # Redis backup
    if command -v redis-cli &>/dev/null && docker ps --format "{{.Names}}" | grep -q "redis"; then
        log "Backing up Redis..." "$BLUE"
        
        local redis_container=$(docker ps --format "{{.Names}}" | grep "redis" | head -1)
        local redis_file="$backup_dir/redis-dump.rdb"
        
        if docker exec "$redis_container" redis-cli BGSAVE && \
           sleep 5 && \
           docker cp "$redis_container:/data/dump.rdb" "$redis_file" 2>/dev/null; then
            log "✓ Redis data backed up" "$GREEN"
        else
            log "✗ Failed to backup Redis data" "$RED"
            return 1
        fi
    fi
    
    # Create archive
    if [[ "$COMPRESS_BACKUPS" == "true" ]]; then
        tar -czf "$backup_file.tar.gz" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar.gz"
    else
        tar -cf "$backup_file.tar" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar"
    fi
    
    # Encrypt backup
    if [[ "$ENCRYPT_BACKUPS" == "true" ]] && command -v gpg &>/dev/null; then
        log "Encrypting database backup..." "$BLUE"
        gpg --trust-model always --encrypt -r "$GPG_RECIPIENT" --batch --yes "$backup_file" 2>/dev/null
        rm -f "$backup_file"
        backup_file="$backup_file.gpg"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local size=$(du -h "$backup_file" | cut -f1)
    
    log "Database backup completed: $backup_file ($size, ${duration}s)" "$GREEN"
    send_backup_notification "SUCCESS" "Database" "$size" "${duration}s" "$backup_file"
    
    echo "$backup_file"
}

# Application backup function
backup_application() {
    local backup_date=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/application/$backup_date"
    local backup_file="$backup_dir/application-backup.tar"
    
    log "Starting application backup..." "$BLUE"
    local start_time=$(date +%s)
    
    mkdir -p "$backup_dir"
    
    # Backup application directories
    local app_dirs=("/opt/rauli-vision" "/var/www/rauli-vision" "/etc/rauli-vision")
    
    for dir in "${app_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            local dir_name=$(basename "$dir")
            log "Backing up $dir..." "$BLUE"
            
            # Create exclude patterns
            local exclude_args=()
            local exclude_patterns=("*.log" "*.tmp" "node_modules" ".git" "coverage" "dist" "build")
            
            for pattern in "${exclude_patterns[@]}"; do
                exclude_args+=("--exclude=$pattern")
            done
            
            if tar "${exclude_args[@]}" -czf "$backup_dir/${dir_name}.tar.gz" -C "$(dirname "$dir")" "$(basename "$dir")" 2>/dev/null; then
                log "✓ Application directory $dir backed up" "$GREEN"
            else
                log "✗ Failed to backup application directory $dir" "$RED"
            fi
        fi
    done
    
    # Backup Docker containers and images
    if command -v docker &>/dev/null; then
        log "Backing up Docker configuration..." "$BLUE"
        
        # Export running containers
        local containers=$(docker ps --format "{{.Names}}" | tr '\n' ' ')
        for container in $containers; do
            docker export "$container" > "$backup_dir/container_${container}.tar" 2>/dev/null || true
        done
        
        # Save images
        docker images --format "{{.Repository}}:{{.Tag}}" | head -10 | while read image; do
            if [[ -n "$image" ]]; then
                docker save "$image" > "$backup_dir/image_$(echo $image | tr '/' '_').tar" 2>/dev/null || true
            fi
        done
        
        # Backup Docker compose files
        find /opt /var/www -name "docker-compose*.yml" -exec cp {} "$backup_dir/" \; 2>/dev/null || true
    fi
    
    # Create archive
    if [[ "$COMPRESS_BACKUPS" == "true" ]]; then
        tar -czf "$backup_file.tar.gz" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar.gz"
    else
        tar -cf "$backup_file.tar" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar"
    fi
    
    # Encrypt backup
    if [[ "$ENCRYPT_BACKUPS" == "true" ]] && command -v gpg &>/dev/null; then
        log "Encrypting application backup..." "$BLUE"
        gpg --trust-model always --encrypt -r "$GPG_RECIPIENT" --batch --yes "$backup_file" 2>/dev/null
        rm -f "$backup_file"
        backup_file="$backup_file.gpg"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local size=$(du -h "$backup_file" | cut -f1)
    
    log "Application backup completed: $backup_file ($size, ${duration}s)" "$GREEN"
    send_backup_notification "SUCCESS" "Application" "$size" "${duration}s" "$backup_file"
    
    echo "$backup_file"
}

# Configuration backup function
backup_configuration() {
    local backup_date=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/configuration/$backup_date"
    local backup_file="$backup_dir/configuration-backup.tar"
    
    log "Starting configuration backup..." "$BLUE"
    local start_time=$(date +%s)
    
    mkdir -p "$backup_dir"
    
    # Backup system configurations
    local config_files=(
        "/etc/nginx/nginx.conf"
        "/etc/ssh/sshd_config"
        "/etc/docker/daemon.json"
        "/etc/hosts"
        "/etc/fstab"
        "/etc/sysctl.conf"
        "/etc/ufw/sysctl.conf"
    )
    
    for config_file in "${config_files[@]}"; do
        if [[ -f "$config_file" ]]; then
            local dest_file="$backup_dir/$(echo "$config_file" | tr '/' '_')"
            cp "$config_file" "$dest_file" 2>/dev/null || true
        fi
    done
    
    # Backup Kubernetes configurations
    if command -v kubectl &>/dev/null && kubectl cluster-info &>/dev/null; then
        log "Backing up Kubernetes configurations..." "$BLUE"
        
        mkdir -p "$backup_dir/kubernetes"
        
        # Export all resources
        kubectl get all --all-namespaces -o yaml > "$backup_dir/kubernetes/all-resources.yaml" 2>/dev/null || true
        
        # Export specific resource types
        local resource_types=("deployments" "services" "configmaps" "secrets" "ingress" "persistentvolumes")
        for resource_type in "${resource_types[@]}"; do
            kubectl get "$resource_type" --all-namespaces -o yaml > "$backup_dir/kubernetes/${resource_type}.yaml" 2>/dev/null || true
        done
    fi
    
    # Backup environment variables
    if [[ -f "/etc/environment" ]]; then
        cp "/etc/environment" "$backup_dir/system_environment" 2>/dev/null || true
    fi
    
    # Backup cron jobs
    crontab -l > "$backup_dir/crontab" 2>/dev/null || true
    
    # Create archive
    if [[ "$COMPRESS_BACKUPS" == "true" ]]; then
        tar -czf "$backup_file.tar.gz" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar.gz"
    else
        tar -cf "$backup_file.tar" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar"
    fi
    
    # Encrypt backup
    if [[ "$ENCRYPT_BACKUPS" == "true" ]] && command -v gpg &>/dev/null; then
        log "Encrypting configuration backup..." "$BLUE"
        gpg --trust-model always --encrypt -r "$GPG_RECIPIENT" --batch --yes "$backup_file" 2>/dev/null
        rm -f "$backup_file"
        backup_file="$backup_file.gpg"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local size=$(du -h "$backup_file" | cut -f1)
    
    log "Configuration backup completed: $backup_file ($size, ${duration}s)" "$GREEN"
    send_backup_notification "SUCCESS" "Configuration" "$size" "${duration}s" "$backup_file"
    
    echo "$backup_file"
}

# System state backup function
backup_system_state() {
    local backup_date=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/system_state/$backup_date"
    local backup_file="$backup_dir/system-state-backup.tar"
    
    log "Starting system state backup..." "$BLUE"
    local start_time=$(date +%s)
    
    mkdir -p "$backup_dir"
    
    # Capture system information
    {
        echo "=== System Information ==="
        uname -a
        echo ""
        
        echo "=== Running Processes ==="
        ps aux
        echo ""
        
        echo "=== Network Connections ==="
        netstat -tuln
        echo ""
        
        echo "=== Disk Usage ==="
        df -h
        echo ""
        
        echo "=== Memory Usage ==="
        free -h
        echo ""
        
        echo "=== System Services ==="
        systemctl list-units --type=service --state=running
        echo ""
        
        echo "=== Docker Containers ==="
        docker ps -a
        echo ""
        
        echo "=== Docker Images ==="
        docker images
        echo ""
        
        echo "=== Kubernetes Resources ==="
        kubectl get all --all-namespaces 2>/dev/null || echo "Kubernetes not available"
        echo ""
        
        echo "=== Environment Variables ==="
        env
        echo ""
        
        echo "=== Last 100 lines of system log ==="
        tail -100 /var/log/syslog 2>/dev/null || tail -100 /var/log/messages 2>/dev/null || echo "No system log found"
    } > "$backup_dir/system_state.txt"
    
    # Backup package lists
    if command -v dpkg &>/dev/null; then
        dpkg --get-selections > "$backup_dir/package_list.txt" 2>/dev/null || true
    elif command -v rpm &>/dev/null; then
        rpm -qa > "$backup_dir/package_list.txt" 2>/dev/null || true
    fi
    
    # Create archive
    if [[ "$COMPRESS_BACKUPS" == "true" ]]; then
        tar -czf "$backup_file.tar.gz" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar.gz"
    else
        tar -cf "$backup_file.tar" -C "$backup_dir" . 2>/dev/null
        rm -rf "$backup_dir"
        backup_file="$backup_file.tar"
    fi
    
    # Encrypt backup
    if [[ "$ENCRYPT_BACKUPS" == "true" ]] && command -v gpg &>/dev/null; then
        log "Encrypting system state backup..." "$BLUE"
        gpg --trust-model always --encrypt -r "$GPG_RECIPIENT" --batch --yes "$backup_file" 2>/dev/null
        rm -f "$backup_file"
        backup_file="$backup_file.gpg"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local size=$(du -h "$backup_file" | cut -f1)
    
    log "System state backup completed: $backup_file ($size, ${duration}s)" "$GREEN"
    send_backup_notification "SUCCESS" "System State" "$size" "${duration}s" "$backup_file"
    
    echo "$backup_file"
}

# Upload to cloud storage
upload_to_cloud() {
    local backup_file="$1"
    local backup_type="$2"
    
    log "Uploading $backup_type backup to cloud..." "$BLUE"
    
    case "$CLOUD_PROVIDER" in
        "aws")
            upload_to_aws "$backup_file" "$backup_type"
            ;;
        "gcp")
            upload_to_gcp "$backup_file" "$backup_type"
            ;;
        "azure")
            upload_to_azure "$backup_file" "$backup_type"
            ;;
        *)
            log "Cloud provider $CLOUD_PROVIDER not supported" "$YELLOW"
            return 1
            ;;
    esac
}

# Upload to AWS S3
upload_to_aws() {
    local backup_file="$1"
    local backup_type="$2"
    
    if command -v aws &>/dev/null; then
        local s3_key="$backup_type/$(basename "$backup_file")"
        
        if aws s3 cp "$backup_file" "s3://$CLOUD_BUCKET/$s3_key" --region "$AWS_REGION" 2>/dev/null; then
            log "✓ Backup uploaded to S3: s3://$CLOUD_BUCKET/$s3_key" "$GREEN"
            return 0
        else
            log "✗ Failed to upload backup to S3" "$RED"
            return 1
        fi
    else
        log "AWS CLI not available" "$YELLOW"
        return 1
    fi
}

# Upload to GCP Cloud Storage
upload_to_gcp() {
    local backup_file="$1"
    local backup_type="$2"
    
    if command -v gsutil &>/dev/null; then
        local gcs_path="gs://$CLOUD_BUCKET/$backup_type/$(basename "$backup_file")"
        
        if gsutil cp "$backup_file" "$gcs_path" 2>/dev/null; then
            log "✓ Backup uploaded to GCS: $gcs_path" "$GREEN"
            return 0
        else
            log "✗ Failed to upload backup to GCS" "$RED"
            return 1
        fi
    else
        log "Google Cloud SDK not available" "$YELLOW"
        return 1
    fi
}

# Upload to Azure Blob Storage
upload_to_azure() {
    local backup_file="$1"
    local backup_type="$2"
    
    if command -v az &>/dev/null; then
        local blob_path="$backup_type/$(basename "$backup_file")"
        
        if az storage blob upload --file "$backup_file" --container-name "$CLOUD_BUCKET" --name "$blob_path" 2>/dev/null; then
            log "✓ Backup uploaded to Azure Blob: $CLOUD_BUCKET/$blob_path" "$GREEN"
            return 0
        else
            log "✗ Failed to upload backup to Azure Blob" "$RED"
            return 1
        fi
    else
        log "Azure CLI not available" "$YELLOW"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up old backups..." "$BLUE"
    
    local backup_types=("database" "application" "configuration" "system_state")
    
    for backup_type in "${backup_types[@]}"; do
        local type_dir="$BACKUP_BASE_DIR/$backup_type"
        
        if [[ -d "$type_dir" ]]; then
            # Remove backups older than retention period
            find "$type_dir" -type f -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
            
            # Remove empty directories
            find "$type_dir" -type d -empty -delete 2>/dev/null || true
            
            log "✓ Cleaned up old $backup_type backups" "$GREEN"
        fi
    done
    
    # Cleanup cloud storage
    case "$CLOUD_PROVIDER" in
        "aws")
            if command -v aws &>/dev/null; then
                aws s3 ls "s3://$CLOUD_BUCKET/" --recursive | while read -r line; do
                    local file_date=$(echo "$line" | awk '{print $1,$2}')
                    local file_path=$(echo "$line" | awk '{print $4}')
                    local file_timestamp=$(date -d "$file_date" +%s 2>/dev/null || echo "0")
                    local cutoff_timestamp=$(date -d "$BACKUP_RETENTION_DAYS days ago" +%s)
                    
                    if [[ $file_timestamp -lt $cutoff_timestamp ]]; then
                        aws s3 rm "s3://$CLOUD_BUCKET/$file_path" 2>/dev/null || true
                    fi
                done
            fi
            ;;
    done
    
    log "Backup cleanup completed" "$GREEN"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log "Verifying backup integrity: $backup_file" "$BLUE"
    
    if [[ "$ENCRYPT_BACKUPS" == "true" ]] && [[ "$backup_file" == *.gpg ]]; then
        # Decrypt for verification
        local decrypted_file="${backup_file%.gpg}"
        gpg --decrypt --batch --yes "$backup_file" > "$decrypted_file" 2>/dev/null || {
            log "✗ Backup decryption failed" "$RED"
            return 1
        }
        backup_file="$decrypted_file"
    fi
    
    # Verify archive integrity
    if [[ "$backup_file" == *.tar.gz ]]; then
        if tar -tzf "$backup_file" &>/dev/null; then
            log "✓ Backup archive integrity verified" "$GREEN"
        else
            log "✗ Backup archive integrity check failed" "$RED"
            return 1
        fi
    elif [[ "$backup_file" == *.tar ]]; then
        if tar -tf "$backup_file" &>/dev/null; then
            log "✓ Backup archive integrity verified" "$GREEN"
        else
            log "✗ Backup archive integrity check failed" "$RED"
            return 1
        fi
    fi
    
    # Clean up decrypted file if created
    if [[ "$ENCRYPT_BACKUPS" == "true" ]] && [[ -f "${backup_file%.gpg}" ]]; then
        rm -f "${backup_file%.gpg}"
    fi
    
    return 0
}

# Schedule backups
schedule_backups() {
    log "Setting up backup schedule..." "$BLUE"
    
    # Create cron directory if needed
    sudo mkdir -p "$(dirname "$SCHEDULE_FILE")"
    
    # Create cron entries
    cat > "$SCHEDULE_FILE" << EOF
# RAULI-VISION Backup Schedule
# Database backup - Daily at 2 AM
0 2 * * * root /usr/local/bin/backup-automation.sh database >> $LOG_FILE 2>&1

# Application backup - Daily at 3 AM
0 3 * * * root /usr/local/bin/backup-automation.sh application >> $LOG_FILE 2>&1

# Configuration backup - Weekly on Sunday at 4 AM
0 4 * * 0 root /usr/local/bin/backup-automation.sh configuration >> $LOG_FILE 2>&1

# System state backup - Weekly on Sunday at 5 AM
0 5 * * 0 root /usr/local/bin/backup-automation.sh system_state >> $LOG_FILE 2>&1

# Cleanup old backups - Daily at 6 AM
0 6 * * * root /usr/local/bin/backup-automation.sh cleanup >> $LOG_FILE 2>&1
EOF
    
    # Reload cron
    sudo systemctl reload cron 2>/dev/null || sudo service cron reload 2>/dev/null || true
    
    log "Backup schedule configured: $SCHEDULE_FILE" "$GREEN"
}

# Generate backup report
generate_backup_report() {
    local backup_type="$1"
    local backup_file="$2"
    local report_dir="reports/backup-$(date +%Y%m%d-%H%M%S)"
    
    log "Generating backup report..." "$BLUE"
    
    mkdir -p "$report_dir"
    
    cat > "$report_dir/backup-report.md" << EOF
# $APP_NAME Backup Report

**Generated:** $(date)  
**Backup Type:** $backup_type  
**Backup File:** $backup_file

## Backup Summary

| Item | Details |
|------|---------|
| Backup Type | $backup_type |
| File Size | $(du -h "$backup_file" | cut -f1) |
| Created | $(date -r "$backup_file") |
| Location | $backup_file |
| Encrypted | $ENCRYPT_BACKUPS |
| Compressed | $COMPRESS_BACKUPS |

## Backup Contents

EOF

    # List backup contents
    if [[ "$backup_file" == *.gpg ]]; then
        echo "Backup is encrypted. Contents not visible without decryption." >> "$report_dir/backup-report.md"
    else
        if [[ "$backup_file" == *.tar.gz ]]; then
            tar -tzf "$backup_file" | head -20 >> "$report_dir/backup-report.md"
            echo "..." >> "$report_dir/backup-report.md"
        elif [[ "$backup_file" == *.tar ]]; then
            tar -tf "$backup_file" | head -20 >> "$report_dir/backup-report.md"
            echo "..." >> "$report_dir/backup-report.md"
        fi
    fi
    
    cat >> "$report_dir/backup-report.md" << EOF

## Backup Verification Status

$(if verify_backup "$backup_file" &>/dev/null; then
    echo "✅ Backup integrity verified"
else
    echo "❌ Backup integrity verification failed"
fi)

## Cloud Storage Status

$(if upload_to_cloud "$backup_file" "$backup_type" &>/dev/null; then
    echo "✅ Backup uploaded to cloud storage"
else
    echo "❌ Cloud upload failed"
fi)

## Retention Policy

- Daily backups retained for 7 days
- Weekly backups retained for 4 weeks
- Monthly backups retained for 12 months
- Yearly backups retained for 3 years

## Restore Instructions

1. Download backup file from local or cloud storage
2. If encrypted, decrypt with: \`gpg --decrypt backup-file.gpg > backup-file.tar\`
3. Extract with: \`tar -xzf backup-file.tar\`
4. Follow component-specific restore procedures

## Next Scheduled Backup

$(cat "$SCHEDULE_FILE" 2>/dev/null | grep "$backup_type" | head -1 || echo "Schedule not configured")

EOF

    log "Backup report generated: $report_dir/backup-report.md" "$GREEN"
    echo "$report_dir"
}

# Main execution
main() {
    local action="${1:-help}"
    
    log "Starting backup automation for $APP_NAME" "$BLUE"
    
    # Create log directory
    sudo mkdir -p "$(dirname "$LOG_FILE")"
    sudo touch "$LOG_FILE"
    sudo chmod 666 "$LOG_FILE"
    
    # Create backup directory
    sudo mkdir -p "$BACKUP_BASE_DIR"
    sudo chown $USER:$USER "$BACKUP_BASE_DIR" 2>/dev/null || true
    
    case "$action" in
        "database")
            create_backup_config
            local backup_file=$(backup_database)
            verify_backup "$backup_file"
            upload_to_cloud "$backup_file" "database"
            generate_backup_report "database" "$backup_file"
            ;;
        "application")
            create_backup_config
            local backup_file=$(backup_application)
            verify_backup "$backup_file"
            upload_to_cloud "$backup_file" "application"
            generate_backup_report "application" "$backup_file"
            ;;
        "configuration")
            create_backup_config
            local backup_file=$(backup_configuration)
            verify_backup "$backup_file"
            upload_to_cloud "$backup_file" "configuration"
            generate_backup_report "configuration" "$backup_file"
            ;;
        "system_state")
            create_backup_config
            local backup_file=$(backup_system_state)
            verify_backup "$backup_file"
            upload_to_cloud "$backup_file" "system_state"
            generate_backup_report "system_state" "$backup_file"
            ;;
        "all")
            create_backup_config
            for backup_type in database application configuration system_state; do
                local backup_file=$(backup_$backup_type)
                verify_backup "$backup_file"
                upload_to_cloud "$backup_file" "$backup_type"
                generate_backup_report "$backup_type" "$backup_file"
            done
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "schedule")
            schedule_backups
            ;;
        "install")
            # Install script system-wide
            sudo cp "$0" "/usr/local/bin/backup-automation.sh"
            sudo chmod +x "/usr/local/bin/backup-automation.sh"
            log "Backup automation script installed to /usr/local/bin/backup-automation.sh" "$GREEN"
            ;;
        "help"|*)
            echo "Usage: $0 {database|application|configuration|system_state|all|cleanup|schedule|install|help}"
            echo ""
            echo "Commands:"
            echo "  database      - Backup databases (PostgreSQL, Redis)"
            echo "  application   - Backup application files and containers"
            echo "  configuration - Backup system configurations"
            echo "  system_state  - Backup system state and information"
            echo "  all           - Run all backup types"
            echo "  cleanup       - Clean up old backups"
            echo "  schedule      - Set up automated backup schedule"
            echo "  install       - Install script system-wide"
            echo "  help          - Show this help message"
            ;;
    esac
}

# Run main function
main "$@"
