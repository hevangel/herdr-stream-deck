param([int]$X, [int]$Y, [string]$OutPath)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinClick {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process StreamDeck | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO WINDOW"; exit 1 }
$hwnd = $proc.MainWindowHandle
[WinClick]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 800

$rect = New-Object WinClick+RECT
[WinClick]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

# Coordinates are given window-relative; convert to screen space.
$sx = $rect.Left + $X
$sy = $rect.Top + $Y
[WinClick]::SetCursorPos($sx, $sy) | Out-Null
Start-Sleep -Milliseconds 200
[WinClick]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)  # LEFTDOWN
Start-Sleep -Milliseconds 60
[WinClick]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)  # LEFTUP
Start-Sleep -Seconds 3

$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bmp.Save($OutPath)
$g.Dispose(); $bmp.Dispose()
Write-Output "clicked ($sx,$sy) saved $OutPath"
