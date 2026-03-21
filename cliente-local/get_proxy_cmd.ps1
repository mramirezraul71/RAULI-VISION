Get-WmiObject Win32_Process | Where-Object { $_.Name -eq 'rauli-proxy.exe' } | Select-Object ProcessId, CommandLine | Format-List
