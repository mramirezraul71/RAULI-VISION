Get-Process | Where-Object { $_.Name -like '*proxy*' -or $_.Name -like '*rauli*' -or $_.Name -like '*cliente*' } | Select-Object Id, Name, Path
