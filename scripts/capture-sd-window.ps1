param([string]$OutPath = "B:\herdr-stream-deck\docs\screenshots\capture.png")

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

# Second launch of StreamDeck.exe toggles the main window into view.
Start-Process 'C:\Program Files\Elgato\StreamDeck\StreamDeck.exe'
Start-Sleep -Seconds 3

$proc = Get-Process StreamDeck | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO WINDOW"; exit 1 }
$hwnd = $proc.MainWindowHandle
[Win]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
[Win]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Seconds 2

$rect = New-Object Win+RECT
[Win]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
Write-Output "window ${w}x${h} at $($rect.Left),$($rect.Top)"

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bmp.Save($OutPath)
$g.Dispose(); $bmp.Dispose()
Write-Output "saved $OutPath"
