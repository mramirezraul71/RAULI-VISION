#!/bin/bash

# RAULI-VISION Security Hardening Script
# Implements comprehensive security hardening for production deployment
# Covers OS, network, application, container, and cloud security

set -euo pipefail

# Configuration
APP_NAME="${APP_NAME:-RAULI-VISION}"
LOG_FILE="/var/log/rauli-vision/security-hardening.log"
REPORT_DIR="reports/security-hardening-$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/tmp/security-hardening-backup-$(date +%Y%m%d-%H%M%S)"

# Security levels
SECURITY_LEVEL="${SECURITY_LEVEL:-high}" # low, medium, high, maximum
AUTO_APPLY="${AUTO_APPLY:-false}" # Set to true to auto-apply fixes

# Security components
HARDEN_OS="${HARDEN_OS:-true}"
HARDEN_NETWORK="${HARDEN_NETWORK:-true}"
HARDEN_CONTAINERS="${HARDEN_CONTAINERS:-true}"
HARDEN_APPLICATION="${HARDEN_APPLICATION:-true}"
HARDEN_CLOUD="${HARDEN_CLOUD:-true}"

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

# Send security alert
send_security_alert() {
    local severity="$1"
    local component="$2"
    local issue="$3"
    local fix="$4"
    
    local message="🔒 Security Hardening: $severity issue found in $component"
    message="$message\nIssue: $issue"
    message="$message\nFix: $fix"
    
    if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$APP_NAME Security: $message\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
    
    if [[ -n "${ALERT_EMAIL:-}" ]]; then
        echo -e "$message" | mail -s "$APP_NAME Security Hardening Alert ($severity)" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    log "SECURITY ALERT: $message" "$RED"
}

# Create backup before making changes
create_backup() {
    log "Creating security configuration backup..." "$BLUE"
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup system files
    local files_to_backup=(
        "/etc/ssh/sshd_config"
        "/etc/security/limits.conf"
        "/etc/sysctl.conf"
        "/etc/hosts.allow"
        "/etc/hosts.deny"
        "/etc/fstab"
        "/etc/passwd"
        "/etc/group"
        "/etc/shadow"
        "/etc/gshadow"
        "/etc/sudoers"
        "/etc/ufw/sysctl.conf"
        "/etc/docker/daemon.json"
        "/etc/kubernetes/manifests"
    )
    
    for file in "${files_to_backup[@]}"; do
        if [[ -f "$file" ]]; then
            cp "$file" "$BACKUP_DIR/" 2>/dev/null || true
        fi
    done
    
    # Backup firewall rules
    if command -v ufw &>/dev/null; then
        ufw status verbose > "$BACKUP_DIR/ufw_status.txt" 2>/dev/null || true
    fi
    
    # Backup iptables rules
    if command -v iptables &>/dev/null; then
        iptables-save > "$BACKUP_DIR/iptables_rules.txt" 2>/dev/null || true
    fi
    
    log "Backup created: $BACKUP_DIR" "$GREEN"
}

# OS Security Hardening
harden_operating_system() {
    log "Starting OS security hardening..." "$BLUE"
    
    local os_issues=()
    local fixes_applied=0
    
    # Check and harden SSH configuration
    if [[ -f "/etc/ssh/sshd_config" ]]; then
        log "Hardening SSH configuration..." "$BLUE"
        
        local ssh_issues=()
        
        # Check SSH settings
        if grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config; then
            ssh_issues+=("Root login enabled")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
                ((fixes_applied++))
                send_security_alert "HIGH" "SSH" "Root login was enabled" "Disabled root login in SSH"
            fi
        fi
        
        if grep -q "^PasswordAuthentication yes" /etc/ssh/sshd_config; then
            ssh_issues+=("Password authentication enabled")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
                ((fixes_applied++))
                send_security_alert "MEDIUM" "SSH" "Password authentication was enabled" "Disabled password auth, use key-based auth"
            fi
        fi
        
        if grep -q "^PermitEmptyPasswords yes" /etc/ssh/sshd_config; then
            ssh_issues+=("Empty passwords permitted")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                sed -i 's/^PermitEmptyPasswords yes/PermitEmptyPasswords no/' /etc/ssh/sshd_config
                ((fixes_applied++))
                send_security_alert "HIGH" "SSH" "Empty passwords were permitted" "Disabled empty passwords"
            fi
        fi
        
        if grep -q "^Protocol 1" /etc/ssh/sshd_config; then
            ssh_issues+=("SSH protocol 1 enabled")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                sed -i 's/^Protocol 1/Protocol 2/' /etc/ssh/sshd_config
                ((fixes_applied++))
                send_security_alert "HIGH" "SSH" "SSH protocol 1 was enabled" "Switched to SSH protocol 2"
            fi
        fi
        
        # Add secure SSH settings if not present
        local secure_ssh_settings=(
            "ClientAliveInterval 300"
            "ClientAliveCountMax 2"
            "MaxAuthTries 3"
            "MaxSessions 5"
            "Banner /etc/ssh/banner"
        )
        
        for setting in "${secure_ssh_settings[@]}"; do
            if ! grep -q "^$(echo "$setting" | cut -d' ' -f1)" /etc/ssh/sshd_config; then
                ssh_issues+=("Missing secure SSH setting: $setting")
                if [[ "$AUTO_APPLY" == "true" ]]; then
                    echo "$setting" >> /etc/ssh/sshd_config
                    ((fixes_applied++))
                fi
            fi
        done
        
        if [[ ${#ssh_issues[@]} -gt 0 ]]; then
            os_issues+=("SSH issues: ${ssh_issues[*]}")
        fi
    fi
    
    # Harden user accounts
    log "Hardening user accounts..." "$BLUE"
    
    # Check for accounts with no passwords
    local no_password_accounts=$(grep -E '^[^:]+:[!*]' /etc/shadow | cut -d':' -f1 | tr '\n' ' ')
    if [[ -n "$no_password_accounts" ]]; then
        os_issues+=("Accounts with no passwords: $no_password_accounts")
    fi
    
    # Check for accounts with UID 0 (root)
    local root_accounts=$(awk -F: '($3 == 0) {print $1}' /etc/passwd | tr '\n' ' ')
    if [[ "$root_accounts" != "root" ]]; then
        os_issues+=("Additional root accounts found: $root_accounts")
    fi
    
    # Harden file permissions
    log "Hardening file permissions..." "$BLUE"
    
    # Secure critical files
    local critical_files=(
        "/etc/passwd:644"
        "/etc/shadow:600"
        "/etc/group:644"
        "/etc/gshadow:600"
        "/etc/ssh/sshd_config:600"
        "/etc/sudoers:440"
    )
    
    for file_perm in "${critical_files[@]}"; do
        local file=$(echo "$file_perm" | cut -d':' -f1)
        local perm=$(echo "$file_perm" | cut -d':' -f2)
        
        if [[ -f "$file" ]]; then
            local current_perm=$(stat -c "%a" "$file" 2>/dev/null || echo "000")
            if [[ "$current_perm" != "$perm" ]]; then
                os_issues+=("Incorrect permissions on $file: $current_perm (should be $perm)")
                if [[ "$AUTO_APPLY" == "true" ]]; then
                    chmod "$perm" "$file"
                    ((fixes_applied++))
                fi
            fi
        fi
    done
    
    # Harden system parameters
    log "Hardening system parameters..." "$BLUE"
    
    # Create sysctl security configuration
    local sysctl_conf="/etc/sysctl.d/99-security.conf"
    local sysctl_settings=(
        "net.ipv4.ip_forward = 0"
        "net.ipv4.conf.all.send_redirects = 0"
        "net.ipv4.conf.default.send_redirects = 0"
        "net.ipv4.conf.all.accept_source_route = 0"
        "net.ipv4.conf.default.accept_source_route = 0"
        "net.ipv4.conf.all.accept_redirects = 0"
        "net.ipv4.conf.default.accept_redirects = 0"
        "net.ipv4.conf.all.secure_redirects = 0"
        "net.ipv4.conf.default.secure_redirects = 0"
        "net.ipv4.conf.all.log_martians = 1"
        "net.ipv4.conf.default.log_martians = 1"
        "net.ipv4.icmp_echo_ignore_broadcasts = 1"
        "net.ipv4.icmp_ignore_bogus_error_responses = 1"
        "net.ipv4.conf.all.rp_filter = 1"
        "net.ipv4.conf.default.rp_filter = 1"
        "net.ipv4.tcp_syncookies = 1"
        "kernel.dmesg_restrict = 1"
        "kernel.kptr_restrict = 2"
        "net.ipv4.tcp_timestamps = 0"
    )
    
    if [[ "$SECURITY_LEVEL" == "maximum" ]]; then
        sysctl_settings+=(
            "net.ipv4.tcp_max_syn_backlog = 4096"
            "net.ipv4.tcp_synack_retries = 2"
            "net.ipv4.tcp_syn_retries = 5"
        )
    fi
    
    # Apply sysctl settings
    for setting in "${sysctl_settings[@]}"; do
        local key=$(echo "$setting" | cut -d'=' -f1 | tr -d ' ')
        if ! grep -q "^$key" "$sysctl_conf" 2>/dev/null; then
            os_issues+=("Missing sysctl security setting: $setting")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                echo "$setting" >> "$sysctl_conf"
                sysctl -w "$setting" 2>/dev/null || true
                ((fixes_applied++))
            fi
        fi
    done
    
    log "OS hardening completed. Issues found: ${#os_issues[@]}, Fixes applied: $fixes_applied" "$BLUE"
    echo "${os_issues[@]}"
}

# Network Security Hardening
harden_network() {
    log "Starting network security hardening..." "$BLUE"
    
    local network_issues=()
    local fixes_applied=0
    
    # Configure firewall
    if command -v ufw &>/dev/null; then
        log "Configuring UFW firewall..." "$BLUE"
        
        # Check if UFW is active
        if ! ufw status | grep -q "Status: active"; then
            network_issues+=("UFW firewall not active")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                ufw --force enable
                ((fixes_applied++))
                send_security_alert "HIGH" "Firewall" "UFW firewall was inactive" "Enabled UFW firewall"
            fi
        fi
        
        # Set default policies
        if ! ufw status verbose | grep -q "Default: deny (incoming)"; then
            network_issues+=("Default incoming policy not set to deny")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                ufw default deny incoming
                ufw default allow outgoing
                ((fixes_applied++))
            fi
        fi
        
        # Allow essential services only
        local essential_ports=("22/tcp" "80/tcp" "443/tcp")
        for port in "${essential_ports[@]}"; do
            if ! ufw status | grep -q "$port"; then
                network_issues+=("Essential port $port not allowed")
                if [[ "$AUTO_APPLY" == "true" ]]; then
                    ufw allow "$port"
                    ((fixes_applied++))
                fi
            fi
        done
        
        # Deny unnecessary ports
        local unnecessary_ports=("23/tcp" "21/tcp" "25/tcp" "53/tcp" "110/tcp" "143/tcp")
        for port in "${unnecessary_ports[@]}"; do
            if ufw status | grep -q "$port"; then
                network_issues+=("Unnecessary port $port allowed")
                if [[ "$AUTO_APPLY" == "true" ]]; then
                    ufw delete allow "$port"
                    ((fixes_applied++))
                    send_security_alert "MEDIUM" "Firewall" "Unnecessary port $port was open" "Closed unnecessary port"
                fi
            fi
        done
    fi
    
    # Check open ports
    log "Scanning open ports..." "$BLUE"
    
    local open_ports=$(netstat -tuln | awk '($1 ~ /^tcp/) && ($6 == "LISTEN") {print $4}' | cut -d':' -f2 | sort -n | tr '\n' ' ')
    local suspicious_ports=("23" "21" "25" "53" "110" "143" "993" "995")
    
    for port in $open_ports; do
        if [[ " ${suspicious_ports[*]} " =~ " $port " ]]; then
            network_issues+=("Suspicious port $port is open")
        fi
    done
    
    # Check network interfaces
    log "Checking network interfaces..." "$BLUE"
    
    local promisc_interfaces=$(ip link show | grep "PROMISC" | wc -l)
    if [[ $promisc_interfaces -gt 0 ]]; then
        network_issues+=("$promiscuous interfaces in promiscuous mode")
    fi
    
    log "Network hardening completed. Issues found: ${#network_issues[@]}, Fixes applied: $fixes_applied" "$BLUE"
    echo "${network_issues[@]}"
}

# Container Security Hardening
harden_containers() {
    log "Starting container security hardening..." "$BLUE"
    
    local container_issues=()
    local fixes_applied=0
    
    if command -v docker &>/dev/null; then
        # Check Docker daemon configuration
        log "Hardening Docker daemon..." "$BLUE"
        
        local docker_config="/etc/docker/daemon.json"
        if [[ ! -f "$docker_config" ]]; then
            container_issues+=("Docker daemon configuration missing")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                mkdir -p "$(dirname "$docker_config")"
                cat > "$docker_config" << 'EOF'
{
  "live-restore": true,
  "userland-proxy": false,
  "experimental": false,
  "no-new-privileges": true,
  "seccomp-profile": "/etc/docker/seccomp/default.json",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
EOF
                ((fixes_applied++))
                send_security_alert "MEDIUM" "Docker" "Docker daemon config was missing" "Created secure Docker daemon configuration"
            fi
        fi
        
        # Check running containers
        log "Analyzing running containers..." "$BLUE"
        
        local containers=$(docker ps --format "{{.Names}}")
        for container in $containers; do
            # Check if container is running as root
            local user=$(docker inspect "$container" --format='{{.Config.User}}' 2>/dev/null || echo "")
            if [[ -z "$user" || "$user" == "root" || "$user" == "0" ]]; then
                container_issues+=("Container $container running as root")
            fi
            
            # Check if container has privileged mode
            local privileged=$(docker inspect "$container" --format='{{.HostConfig.Privileged}}' 2>/dev/null || echo "false")
            if [[ "$privileged" == "true" ]]; then
                container_issues+=("Container $container running in privileged mode")
                send_security_alert "HIGH" "Docker" "Container $container running privileged" "Container should not run in privileged mode"
            fi
            
            # Check if container mounts sensitive directories
            local mounts=$(docker inspect "$container" --format='{{range .Mounts}}{{.Destination}} {{end}}' 2>/dev/null || echo "")
            local sensitive_mounts=("/etc" "/root" "/var/run/docker.sock")
            
            for mount in $mounts; do
                for sensitive in "${sensitive_mounts[@]}"; do
                    if [[ "$mount" == "$sensitive"* ]]; then
                        container_issues+=("Container $container mounts sensitive directory: $mount")
                        send_security_alert "HIGH" "Docker" "Container $container mounts $mount" "Avoid mounting sensitive host directories"
                    fi
                done
            done
        done
        
        # Check Docker socket permissions
        local docker_socket_perms=$(stat -c "%a" /var/run/docker.sock 2>/dev/null || echo "000")
        if [[ "$docker_socket_perms" != "660" ]]; then
            container_issues+=("Docker socket permissions incorrect: $docker_socket_perms")
            if [[ "$AUTO_APPLY" == "true" ]]; then
                chmod 660 /var/run/docker.sock
                ((fixes_applied++))
            fi
        fi
    fi
    
    if command -v kubectl &>/dev/null && kubectl cluster-info &>/dev/null; then
        log "Hardening Kubernetes cluster..." "$BLUE"
        
        # Check PodSecurityPolicies
        local psp_count=$(kubectl get podsecuritypolicy --no-headers 2>/dev/null | wc -l)
        if [[ $psp_count -eq 0 ]]; then
            container_issues+=("No PodSecurityPolicies defined")
        fi
        
        # Check NetworkPolicies
        local np_count=$(kubectl get networkpolicy --all-namespaces --no-headers 2>/dev/null | wc -l)
        if [[ $np_count -eq 0 ]]; then
            container_issues+=("No NetworkPolicies defined")
        fi
        
        # Check RBAC
        local rbac_enabled=$(kubectl auth can-i --list --as=system:anonymous 2>/dev/null | grep -c "yes" || echo "0")
        if [[ $rbac_enabled -gt 0 ]]; then
            container_issues+=("RBAC allows anonymous access")
        fi
    fi
    
    log "Container hardening completed. Issues found: ${#container_issues[@]}, Fixes applied: $fixes_applied" "$BLUE"
    echo "${container_issues[@]}"
}

# Application Security Hardening
harden_application() {
    log "Starting application security hardening..." "$BLUE"
    
    local app_issues=()
    local fixes_applied=0
    
    # Check web server configuration
    if command -v nginx &>/dev/null; then
        log "Hardening Nginx configuration..." "$BLUE"
        
        local nginx_conf="/etc/nginx/nginx.conf"
        if [[ -f "$nginx_conf" ]]; then
            # Check security headers
            local security_headers=(
                "add_header X-Frame-Options DENY;"
                "add_header X-Content-Type-Options nosniff;"
                "add_header X-XSS-Protection \"1; mode=block\";"
                "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;"
                "add_header Referrer-Policy \"strict-origin-when-cross-origin\";"
            )
            
            for header in "${security_headers[@]}"; then
                if ! grep -q "$(echo "$header" | cut -d' ' -f2)" "$nginx_conf"; then
                    app_issues+=("Missing security header: $(echo "$header" | cut -d' ' -f2)")
                fi
            done
            
            # Check for server version disclosure
            if grep -q "server_tokens on" "$nginx_conf"; then
                app_issues+=("Server tokens enabled (version disclosure)")
                if [[ "$AUTO_APPLY" == "true" ]]; then
                    sed -i 's/server_tokens on/server_tokens off/' "$nginx_conf"
                    ((fixes_applied++))
                fi
            fi
        fi
    fi
    
    # Check application dependencies
    log "Scanning application dependencies..." "$BLUE"
    
    if [[ -f "dashboard/package.json" ]]; then
        # Check for known vulnerable packages
        if command -v npm &>/dev/null; then
            cd dashboard
            local vuln_output=$(npm audit --json 2>/dev/null || echo "{}")
            local vuln_count=$(echo "$vuln_output" | jq '.metadata.vulnerabilities.total // 0' 2>/dev/null || echo "0")
            
            if [[ $vuln_count -gt 0 ]]; then
                app_issues+=("$vuln_count vulnerable npm packages found")
            fi
            cd ..
        fi
    fi
    
    if [[ -f "espejo/go.mod" ]]; then
        # Check Go modules for vulnerabilities
        if command -v go &>/dev/null; then
            cd espejo
            if ! go list -m -u all | grep -q "\["; then
                local outdated=$(go list -m -u all | grep '\[' | wc -l || echo "0")
                if [[ $outdated -gt 0 ]]; then
                    app_issues+=("$outdated outdated Go modules")
                fi
            fi
            cd ..
        fi
    fi
    
    # Check environment variables for secrets
    log "Checking for exposed secrets..." "$BLUE"
    
    local env_files=(".env" ".env.local" ".env.production")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            # Check for potential secrets
            local secret_patterns=("password" "secret" "key" "token" "api_key")
            for pattern in "${secret_patterns[@]}"; do
                if grep -i "$pattern" "$env_file" &>/dev/null; then
                    app_issues+=("Potential secrets in $env_file (pattern: $pattern)")
                fi
            done
        fi
    done
    
    log "Application hardening completed. Issues found: ${#app_issues[@]}, Fixes applied: $fixes_applied" "$BLUE"
    echo "${app_issues[@]}"
}

# Cloud Security Hardening
harden_cloud() {
    log "Starting cloud security hardening..." "$BLUE"
    
    local cloud_issues=()
    local fixes_applied=0
    
    # AWS security checks
    if command -v aws &>/dev/null; then
        log "Checking AWS security configuration..." "$BLUE"
        
        # Check S3 bucket permissions
        local buckets=$(aws s3 ls 2>/dev/null | awk '{print $3}' || echo "")
        for bucket in $buckets; do
            local bucket_acl=$(aws s3api get-bucket-acl --bucket "$bucket" 2>/dev/null || echo "")
            if echo "$bucket_acl" | grep -q "AllUsers\|AuthenticatedUsers"; then
                cloud_issues+=("S3 bucket $bucket has public access")
            fi
        done
        
        # Check EC2 security groups
        local security_groups=$(aws ec2 describe-security-groups --query 'SecurityGroups[*].GroupId' --output text 2>/dev/null || echo "")
        for sg in $security_groups; do
            local open_rules=$(aws ec2 describe-security-groups --group-ids "$sg" --query 'SecurityGroups[*].IpPermissions[?CidrIp==`0.0.0.0/0`]' --output text 2>/dev/null | wc -l || echo "0")
            if [[ $open_rules -gt 0 ]]; then
                cloud_issues+=("Security group $sg has open 0.0.0.0/0 rules")
            fi
        done
        
        # Check IAM users with console access
        local console_users=$(aws iam list-users --query 'Users[?PasswordLastUsed!=null].UserName' --output text 2>/dev/null || echo "")
        if [[ -n "$console_users" ]]; then
            local user_count=$(echo "$console_users" | wc -w)
            cloud_issues+=("$user_count IAM users have console access")
        fi
    fi
    
    # GCP security checks
    if command -v gcloud &>/dev/null; then
        log "Checking GCP security configuration..." "$BLUE"
        
        # Check firewall rules
        local open_firewall_rules=$(gcloud compute firewall-rules list --filter="direction:INGRESS AND allowed[].IPProtocol:tcp" --format="value(name)" 2>/dev/null || echo "")
        if [[ -n "$open_firewall_rules" ]]; then
            cloud_issues+=("Open firewall rules found in GCP")
        fi
        
        # Check service accounts
        local service_accounts=$(gcloud iam service-accounts list --format="value(email)" 2>/dev/null || echo "")
        for sa in $service_accounts; do
            local keys=$(gcloud iam service-accounts keys list --iam-account="$sa" --format="value(name)" 2>/dev/null || echo "")
            if [[ -n "$keys" ]]; then
                cloud_issues+=("Service account $sa has user-managed keys")
            fi
        done
    fi
    
    # Azure security checks
    if command -v az &>/dev/null; then
        log "Checking Azure security configuration..." "$BLUE"
        
        # Check network security groups
        local nsgs=$(az network nsg list --query "[].name" --output tsv 2>/dev/null || echo "")
        for nsg in $nsgs; do
            local open_rules=$(az network nsg rule list --nsg-name "$nsg" --query "[?access=='Allow' && destinationAddressPrefix=='*']" --output tsv 2>/dev/null | wc -l || echo "0")
            if [[ $open_rules -gt 0 ]]; then
                cloud_issues+=("Network security group $nsg has open rules")
            fi
        done
        
        # Check storage accounts
        local storage_accounts=$(az storage account list --query "[].name" --output tsv 2>/dev/null || echo "")
        for sa in $storage_accounts; do
            local public_access=$(az storage account show --name "$sa" --query "allowBlobPublicAccess" --output tsv 2>/dev/null || echo "false")
            if [[ "$public_access" == "true" ]]; then
                cloud_issues+=("Storage account $sa allows public access")
            fi
        done
    fi
    
    log "Cloud hardening completed. Issues found: ${#cloud_issues[@]}, Fixes applied: $fixes_applied" "$BLUE"
    echo "${cloud_issues[@]}"
}

# Generate comprehensive security report
generate_security_report() {
    local os_issues="$1"
    local network_issues="$2"
    local container_issues="$3"
    local app_issues="$4"
    local cloud_issues="$5"
    
    log "Generating security hardening report..." "$BLUE"
    
    mkdir -p "$REPORT_DIR"
    
    cat > "$REPORT_DIR/security-hardening-report.md" << EOF
# $APP_NAME Security Hardening Report

**Generated:** $(date)  
**Environment:** $(hostname)  
**Security Level:** $SECURITY_LEVEL  
**Auto-apply enabled:** $AUTO_APPLY

## Executive Summary

This report provides a comprehensive assessment of security hardening measures across all infrastructure components.

## Security Assessment Results

### Operating System Security
**Issues found:** $(echo "$os_issues" | wc -w)

$(if [[ -n "$os_issues" ]]; then
    echo "#### Identified Issues:"
    for issue in $os_issues; do
        echo "- $issue"
    done
else
    echo "✅ No critical OS security issues found"
fi)

### Network Security
**Issues found:** $(echo "$network_issues" | wc -w)

$(if [[ -n "$network_issues" ]]; then
    echo "#### Identified Issues:"
    for issue in $network_issues; do
        echo "- $issue"
    done
else
    echo "✅ No critical network security issues found"
fi)

### Container Security
**Issues found:** $(echo "$container_issues" | wc -w)

$(if [[ -n "$container_issues" ]]; then
    echo "#### Identified Issues:"
    for issue in $container_issues; do
        echo "- $issue"
    done
else
    echo "✅ No critical container security issues found"
fi)

### Application Security
**Issues found:** $(echo "$app_issues" | wc -w)

$(if [[ -n "$app_issues" ]]; then
    echo "#### Identified Issues:"
    for issue in $app_issues; do
        echo "- $issue"
    done
else
    echo "✅ No critical application security issues found"
fi)

### Cloud Security
**Issues found:** $(echo "$cloud_issues" | wc -w)

$(if [[ -n "$cloud_issues" ]]; then
    echo "#### Identified Issues:"
    for issue in $cloud_issues; do
        echo "- $issue"
    done
else
    echo "✅ No critical cloud security issues found"
fi)

## Security Score Calculation

| Component | Issues | Weight | Score |
|-----------|--------|--------|-------|
| Operating System | $(echo "$os_issues" | wc -w) | 25% | $(if [[ $(echo "$os_issues" | wc -w) -eq 0 ]]; then echo "100%"; elif [[ $(echo "$os_issues" | wc -w) -le 3 ]]; then echo "75%"; elif [[ $(echo "$os_issues" | wc -w) -le 6 ]]; then echo "50%"; else echo "25%"; fi) |
| Network | $(echo "$network_issues" | wc -w) | 20% | $(if [[ $(echo "$network_issues" | wc -w) -eq 0 ]]; then echo "100%"; elif [[ $(echo "$network_issues" | wc -w) -le 2 ]]; then echo "75%"; elif [[ $(echo "$network_issues" | wc -w) -le 4 ]]; then echo "50%"; else echo "25%"; fi) |
| Containers | $(echo "$container_issues" | wc -w) | 20% | $(if [[ $(echo "$container_issues" | wc -w) -eq 0 ]]; then echo "100%"; elif [[ $(echo "$container_issues" | wc -w) -le 2 ]]; then echo "75%"; elif [[ $(echo "$container_issues" | wc -w) -le 4 ]]; then echo "50%"; else echo "25%"; fi) |
| Application | $(echo "$app_issues" | wc -w) | 20% | $(if [[ $(echo "$app_issues" | wc -w) -eq 0 ]]; then echo "100%"; elif [[ $(echo "$app_issues" | wc -w) -le 3 ]]; then echo "75%"; elif [[ $(echo "$app_issues" | wc -w) -le 6 ]]; then echo "50%"; else echo "25%"; fi) |
| Cloud | $(echo "$cloud_issues" | wc -w) | 15% | $(if [[ $(echo "$cloud_issues" | wc -w) -eq 0 ]]; then echo "100%"; elif [[ $(echo "$cloud_issues" | wc -w) -le 2 ]]; then echo "75%"; elif [[ $(echo "$cloud_issues" | wc -w) -le 4 ]]; then echo "50%"; else echo "25%"; fi) |

**Overall Security Score:** TBD (Calculate weighted average)

## Hardening Recommendations

### Immediate Actions (Critical)
- Address any HIGH severity issues immediately
- Apply all available security patches
- Disable unnecessary services and ports
- Implement proper access controls

### Short-term Improvements (1-2 weeks)
- Configure comprehensive monitoring and alerting
- Implement automated security scanning
- Create security incident response procedures
- Conduct security training for team members

### Long-term Strategy (1-3 months)
- Implement zero-trust architecture
- Set up regular penetration testing
- Create security compliance framework
- Establish security governance policies

## Backup Information

**Backup Location:** $BACKUP_DIR  
**Restore Command:** \`sudo cp -r $BACKUP_DIR/* /\`

## Next Steps

1. Review all identified security issues
2. Prioritize fixes based on risk assessment
3. Implement fixes in non-production environment first
4. Schedule maintenance window for production fixes
5. Update security documentation and procedures
6. Schedule regular security hardening assessments

EOF

    log "Security hardening report generated: $REPORT_DIR/security-hardening-report.md" "$GREEN"
    echo "$REPORT_DIR"
}

# Main execution
main() {
    log "Starting comprehensive security hardening for $APP_NAME" "$BLUE"
    
    # Create log directory
    sudo mkdir -p "$(dirname "$LOG_FILE")"
    sudo touch "$LOG_FILE"
    sudo chmod 666 "$LOG_FILE"
    
    # Create backup
    create_backup
    
    # Run security hardening assessments
    local os_issues=""
    local network_issues=""
    local container_issues=""
    local app_issues=""
    local cloud_issues=""
    
    if [[ "$HARDEN_OS" == "true" ]]; then
        os_issues=$(harden_operating_system)
    fi
    
    if [[ "$HARDEN_NETWORK" == "true" ]]; then
        network_issues=$(harden_network)
    fi
    
    if [[ "$HARDEN_CONTAINERS" == "true" ]]; then
        container_issues=$(harden_containers)
    fi
    
    if [[ "$HARDEN_APPLICATION" == "true" ]]; then
        app_issues=$(harden_application)
    fi
    
    if [[ "$HARDEN_CLOUD" == "true" ]]; then
        cloud_issues=$(harden_cloud)
    fi
    
    # Generate report
    local report_dir=$(generate_security_report "$os_issues" "$network_issues" "$container_issues" "$app_issues" "$cloud_issues")
    
    # Send summary notification
    local total_issues=$(($(echo "$os_issues" | wc -w) + $(echo "$network_issues" | wc -w) + $(echo "$container_issues" | wc -w) + $(echo "$app_issues" | wc -w) + $(echo "$cloud_issues" | wc -w)))
    
    if [[ $total_issues -gt 0 ]]; then
        send_security_alert "INFO" "Summary" "Security hardening completed" "$total_issues issues identified. Report available in $report_dir"
    else
        log "✅ Security hardening completed with no issues found!" "$GREEN"
    fi
    
    log "Security hardening completed" "$GREEN"
    log "Report available in: $report_dir" "$BLUE"
    log "Backup available in: $BACKUP_DIR" "$BLUE"
}

# Run main function
main "$@"
