# RAULI-VISION Enterprise Operations - Simple Windows Version

function Show-Header {
    Clear-Host
    Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor White
    Write-Host "║                    RAULI-VISION ENTERPRISE                    ║" -ForegroundColor White
    Write-Host "║                  OPERATIONS COMMAND CENTER                  ║" -ForegroundColor White
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor White
    Write-Host ""
}

function Show-MainMenu {
    Write-Host "Enterprise Operations Menu" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Quick Health Check"
    Write-Host "2. System Health Dashboard"
    Write-Host "3. Performance Scripts (requires Bash)"
    Write-Host "4. Security Scripts (requires Bash)"
    Write-Host "5. Backup Scripts (requires Bash)"
    Write-Host "6. Install Git Bash"
    Write-Host "0. Exit"
    Write-Host ""
}

function Invoke-QuickHealthCheck {
    Clear-Host
    Show-Header
    Write-Host "Quick Health Check" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "System Health Status" -ForegroundColor White
    Write-Host "====================" -ForegroundColor White
    
    $issues = 0
    
    Write-Host ""
    Write-Host "Resources:" -ForegroundColor White
    $cpu = Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average
    $memory = Get-WmiObject -Class Win32_OperatingSystem
    $memoryUsage = [math]::Round((($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / $memory.TotalVisibleMemorySize) * 100, 1)
    $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskUsage = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
    
    Write-Host "CPU: ${cpu}%" -ForegroundColor White
    Write-Host "Memory: ${memoryUsage}%" -ForegroundColor White
    Write-Host "Disk: ${diskUsage}%" -ForegroundColor White
    
    if ($cpu -gt 80) { $issues++ }
    if ($memoryUsage -gt 85) { $issues++ }
    if ($diskUsage -gt 90) { $issues++ }
    
    Write-Host ""
    Write-Host "Network Status" -ForegroundColor White
    Write-Host "================" -ForegroundColor White
    
    try {
        $test = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
        if ($test) {
            Write-Host "Internet: Connected" -ForegroundColor Green
        } else {
            Write-Host "Internet: Disconnected" -ForegroundColor Red
        }
    } catch {
        Write-Host "Internet: Unknown" -ForegroundColor Yellow
    }
    
    Write-Host ""
    if ($issues -eq 0) {
        Write-Host "Overall Status: HEALTHY" -ForegroundColor Green
    } elseif ($issues -le 3) {
        Write-Host "Overall Status: WARNING ($issues issues)" -ForegroundColor Yellow
    } else {
        Write-Host "Overall Status: CRITICAL ($issues issues)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Press Enter to continue..." -ForegroundColor Gray
    Read-Host
}

function Show-SystemHealthDashboard {
    while ($true) {
        Clear-Host
        Show-Header
        Write-Host "System Health Dashboard" -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "Real-time System Metrics" -ForegroundColor White
        Write-Host "==========================" -ForegroundColor White
        
        $cpu = Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average
        $cpuColor = if ($cpu -gt 90) { "Red" } elseif ($cpu -gt 70) { "Yellow" } else { "Green" }
        Write-Host "CPU Usage:    " -NoNewline -ForegroundColor White
        Write-Host "${cpu}%" -ForegroundColor $cpuColor
        
        $memory = Get-WmiObject -Class Win32_OperatingSystem
        $memoryUsage = [math]::Round((($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / $memory.TotalVisibleMemorySize) * 100, 1)
        $memoryColor = if ($memoryUsage -gt 90) { "Red" } elseif ($memoryUsage -gt 75) { "Yellow" } else { "Green" }
        Write-Host "Memory Usage: " -NoNewline -ForegroundColor White
        Write-Host "${memoryUsage}%" -ForegroundColor $memoryColor
        
        $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
        $diskUsage = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        $diskColor = if ($diskUsage -gt 95) { "Red" } elseif ($diskUsage -gt 80) { "Yellow" } else { "Green" }
        Write-Host "Disk Usage:   " -NoNewline -ForegroundColor White
        Write-Host "${diskUsage}%" -ForegroundColor $diskColor
        
        Write-Host ""
        Write-Host "Network Status" -ForegroundColor White
        Write-Host "================" -ForegroundColor White
        
        try {
            $test = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
            if ($test) {
                Write-Host "Internet: Connected" -ForegroundColor Green
            } else {
                Write-Host "Internet: Disconnected" -ForegroundColor Red
            }
        } catch {
            Write-Host "Internet: Unknown" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "Last updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Auto-refresh in 10 seconds... (Press any key to stop)" -ForegroundColor Gray
        
        $timeout = 10
        $startTime = Get-Date
        
        while ((Get-Date) -lt $startTime.AddSeconds($timeout)) {
            if ($Host.UI.RawUI.KeyAvailable) {
                $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                break
            }
            Start-Sleep -Milliseconds 100
        }
    }
}

function Show-ScriptMenu {
    param([string]$Category, [string[]]$Scripts)
    
    while ($true) {
        Clear-Host
        Show-Header
        Write-Host "$Category Scripts" -ForegroundColor Cyan
        Write-Host ""
        
        for ($i = 0; $i -lt $Scripts.Count; $i++) {
            Write-Host "$($i + 1). $($Scripts[$i])" -ForegroundColor White
        }
        Write-Host "0. Back to Main Menu"
        Write-Host ""
        
        $choice = Read-Host "Select an option"
        
        if ($choice -eq "0") {
            break
        }
        
        $index = [int]$choice - 1
        if ($index -ge 0 -and $index -lt $Scripts.Count) {
            $scriptName = $Scripts[$index]
            Write-Host "To run $scriptName, use Git Bash:" -ForegroundColor Yellow
            Write-Host "  cd /c/dev/RAULI-VISION" -ForegroundColor Gray
            Write-Host "  ./scripts/$scriptName" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Press Enter to continue..." -ForegroundColor Gray
            Read-Host
        } else {
            Write-Host "Invalid option" -ForegroundColor Red
            Start-Sleep -Seconds 2
        }
    }
}

function Show-GitBashInstall {
    Clear-Host
    Show-Header
    Write-Host "Install Git Bash" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Git Bash is required to run the enterprise scripts." -ForegroundColor White
    Write-Host ""
    Write-Host "Installation steps:" -ForegroundColor Yellow
    Write-Host "1. Download Git for Windows from: https://git-scm.com/download/win" -ForegroundColor White
    Write-Host "2. Run the installer with default options" -ForegroundColor White
    Write-Host "3. Restart PowerShell" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "Alternative: Install WSL (Windows Subsystem for Linux)" -ForegroundColor Yellow
    Write-Host "Run: wsl --install" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press Enter to continue..." -ForegroundColor Gray
    Read-Host
}

function Main {
    while ($true) {
        Show-Header
        Show-MainMenu
        
        $choice = Read-Host "Select an option"
        
        switch ($choice) {
            "1" { Invoke-QuickHealthCheck }
            "2" { Show-SystemHealthDashboard }
            "3" { 
                $scripts = @("performance-benchmark.sh", "infrastructure-health.sh", "sla-monitor.sh")
                Show-ScriptMenu "Performance" $scripts
            }
            "4" { 
                $scripts = @("security-audit.sh", "security-hardening.sh", "compliance-audit.sh")
                Show-ScriptMenu "Security" $scripts
            }
            "5" { 
                $scripts = @("backup-automation.sh", "disaster-recovery.sh")
                Show-ScriptMenu "Backup" $scripts
            }
            "6" { Show-GitBashInstall }
            "0" { 
                Write-Host "Thank you for using RAULI-VISION Enterprise Operations!" -ForegroundColor Green
                exit 0
            }
            default { 
                Write-Host "Invalid option. Please try again." -ForegroundColor Red
                Start-Sleep -Seconds 2
            }
        }
    }
}

Main
