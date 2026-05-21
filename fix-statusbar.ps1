 = 'C:\Users\GJC\Documents\Codex\electron-app\index.html'
 = [System.IO.File]::ReadAllText(, [System.Text.Encoding]::UTF8)
 = '<div class= status-bar id=status-bar></div>'
 = '<div class=status-bar id=status-bar>' + 
 + '              <div class=status-left>' + 
 + '                <span class=status-item id=status-cursor>Ln 1, Col 1</span>' + 
 + '              </div>' + 
 + '              <div class=status-right>' + 
 + '                <span class=status-item id=status-language>plaintext</span>' + 
 + '              </div>' + 
 + '            </div>'
 = .Replace(, )
[System.IO.File]::WriteAllText(, , (New-Object System.Text.UTF8Encoding False))
Write-Output 'statusbar fixed'
