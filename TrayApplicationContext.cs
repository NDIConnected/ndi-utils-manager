using System.Diagnostics;
using System.Drawing.Drawing2D;
using NDIManager.Hosting;
using NDIManager.Models;
using NDIManager.Services;

namespace NDIManager;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly string[] _args;
    private readonly string _settingsPath;

    private readonly FileLoggerProvider _fileLogger = new(FileLoggerProvider.DefaultDirectory);
    private readonly NdiManagerHost _host;
    private int _currentPort;
    private bool _serverRunning;

    private ToolStripMenuItem? _portMenuItem;
    private ToolStripMenuItem? _statusMenuItem;
    private ToolStripMenuItem? _discoveryMenuItem;

    private Icon? _iconGreen;
    private Icon? _iconYellow;
    private Icon? _iconRed;
    private string _lastHealth = "unknown";
    private readonly SynchronizationContext? _uiContext = SynchronizationContext.Current;

    public TrayApplicationContext(string[] args)
    {
        _args = args;
        _settingsPath = InitSettingsPath();
        _currentPort = ManagerSettings.LoadPort(_settingsPath);
        _host = new NdiManagerHost(_fileLogger);
        _host.StatusUpdated += OnDiscoverySnapshotUpdated;

        _trayIcon = new NotifyIcon
        {
            Icon = LoadTrayIcon(),
            Text = $"NDI Manager - Port {_currentPort}",
            Visible = true,
            ContextMenuStrip = BuildContextMenu()
        };

        _iconGreen = CreateColoredTrayIcon(Color.FromArgb(34, 197, 94));
        _iconYellow = CreateColoredTrayIcon(Color.FromArgb(234, 179, 8));
        _iconRed = CreateColoredTrayIcon(Color.FromArgb(239, 68, 68));

        _trayIcon.DoubleClick += (_, _) => OpenWebUI();

        _ = StartWebServerAsync();
    }

    private ContextMenuStrip BuildContextMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Renderer = new ToolStripProfessionalRenderer(new DarkColorTable());

        // Open Web UI (bold = default action)
        var openItem = new ToolStripMenuItem("Open Web UI");
        openItem.Font = new Font(openItem.Font, FontStyle.Bold);
        openItem.Click += (_, _) => OpenWebUI();
        menu.Items.Add(openItem);

        menu.Items.Add(new ToolStripSeparator());

        // Status
        _statusMenuItem = new ToolStripMenuItem("Status: starting...")
        {
            Enabled = false
        };
        menu.Items.Add(_statusMenuItem);

        _discoveryMenuItem = new ToolStripMenuItem("Discovery Server: —")
        {
            Enabled = false
        };
        menu.Items.Add(_discoveryMenuItem);

        // Port
        _portMenuItem = new ToolStripMenuItem($"Port: {_currentPort}");
        _portMenuItem.Click += (_, _) => ChangePort();
        menu.Items.Add(_portMenuItem);

        var restartItem = new ToolStripMenuItem("Restart service");
        restartItem.Click += (_, _) => _ = RestartWebServerAsync();
        menu.Items.Add(restartItem);

        var logsItem = new ToolStripMenuItem("Open data folder");
        logsItem.Click += (_, _) => OpenDataFolder();
        menu.Items.Add(logsItem);

        menu.Items.Add(new ToolStripSeparator());

        // Exit
        var exitItem = new ToolStripMenuItem("Exit");
        exitItem.Click += (_, _) => ExitApplication();
        menu.Items.Add(exitItem);

        return menu;
    }

    #region Web Server

    private async Task StartWebServerAsync()
    {
        try
        {
            // Server, API and discovery come from NDIManager.Core (shared with the Linux app).
            // In WinExe mode console logging goes nowhere: logs go to the shared file logger.
            await _host.StartAsync(_currentPort, _args);

            UpdateStatus(true);

            _trayIcon.ShowBalloonTip(
                2000,
                "NDI Manager",
                $"Running on http://localhost:{_currentPort}",
                ToolTipIcon.Info);
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown/restart
        }
        catch (Exception ex)
        {
            UpdateStatus(false);
            _trayIcon.ShowBalloonTip(
                5000,
                "NDI Manager - Error",
                $"Failed to start on port {_currentPort}: {ex.Message}",
                ToolTipIcon.Error);
        }
    }

    private async Task StopWebServerAsync()
    {
        // Waits for the discovery loop to end, NDI handles to be released and the port to be freed.
        try
        {
            await _host.StopAsync();
        }
        catch
        {
            // Errors while stopping are not actionable from the tray.
        }

        _serverRunning = false;
    }

    private async Task RestartWebServerAsync()
    {
        UpdateStatus(false);

        _trayIcon.ShowBalloonTip(
            2000,
            "NDI Manager",
            $"Restarting on port {_currentPort}...",
            ToolTipIcon.Info);

        await StopWebServerAsync();

        _ = StartWebServerAsync();
    }

    private void OnDiscoverySnapshotUpdated(NdiSystemStatus status)
    {
        if (!_host.IsRunning)
            return;

        try
        {
            UpdateTrayFromStatus(status);
        }
        catch
        {
            // Ignore tray update errors.
        }
    }

    private void UpdateTrayFromStatus(NdiSystemStatus status)
    {
        if (_uiContext != null && SynchronizationContext.Current != _uiContext)
        {
            _uiContext.Post(_ => UpdateTrayFromStatus(status), null);
            return;
        }

        _lastHealth = status.Health;

        if (_statusMenuItem != null)
        {
            _statusMenuItem.Text = status.Health switch
            {
                "ok" => $"Status: OK · {status.SenderCount} snd · {status.ReceiverCount} rcv",
                "idle" => $"Status: waiting for NDI · {status.SenderCount} snd · {status.ReceiverCount} rcv",
                "degraded" => "Status: partial listener",
                "stalled" => "Status: discovery stalled",
                "error" => "Status: listener error",
                _ => "Status: unknown",
            };
        }

        if (_discoveryMenuItem != null)
        {
            var send = status.SendListenerConnected ? "send OK" : "send OFF";
            var recv = status.RecvListenerConnected ? "recv OK" : "recv OFF";
            _discoveryMenuItem.Text = $"Discovery: {send} · {recv} · {status.DiscoveryServerUrl}";
        }

        _trayIcon.Icon = status.Health switch
        {
            "ok" => _iconGreen ?? _trayIcon.Icon,
            "idle" => _iconYellow ?? _trayIcon.Icon,
            "degraded" => _iconYellow ?? _trayIcon.Icon,
            "stalled" => _iconRed ?? _trayIcon.Icon,
            "error" => _iconRed ?? _trayIcon.Icon,
            _ => LoadTrayIcon(),
        };

        _trayIcon.Text = _serverRunning
            ? $"NDI Manager — http://localhost:{_currentPort} ({status.Health})"
            : "NDI Manager — stopped";
    }

    private void UpdateStatus(bool running)
    {
        _serverRunning = running;

        if (_statusMenuItem != null)
        {
            _statusMenuItem.Text = running
                ? "Status: running"
                : "Status: stopped";
        }

        _trayIcon.Text = running
            ? $"NDI Manager — http://localhost:{_currentPort}"
            : "NDI Manager — stopped";
    }

    #endregion

    #region Menu Actions

    private void OpenDataFolder()
    {
        var folder = Path.GetDirectoryName(_settingsPath) ?? InitSettingsPath();
        Directory.CreateDirectory(folder);
        Process.Start(new ProcessStartInfo
        {
            FileName = folder,
            UseShellExecute = true
        });
    }

    private void OpenWebUI()
    {
        if (!_serverRunning)
        {
            _trayIcon.ShowBalloonTip(
                2000,
                "NDI Manager",
                "The server is not running.",
                ToolTipIcon.Warning);
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = $"http://localhost:{_currentPort}",
            UseShellExecute = true
        });
    }

    private void ChangePort()
    {
        using var dialog = new PortChangeDialog(_currentPort);

        if (dialog.ShowDialog() == DialogResult.OK && dialog.SelectedPort != _currentPort)
        {
            _currentPort = dialog.SelectedPort;
            ManagerSettings.SavePort(_currentPort, _settingsPath);

            if (_portMenuItem != null)
                _portMenuItem.Text = $"Port: {_currentPort}";

            _ = RestartWebServerAsync();
        }
    }

    private async void ExitApplication()
    {
        _trayIcon.Visible = false;
        await StopWebServerAsync();
        Application.Exit();
    }

    #endregion

    #region Settings

    private static string InitSettingsPath()
    {
        Directory.CreateDirectory(AppPaths.DataDirectory);
        return AppPaths.SettingsPath;
    }

    #endregion

    #region Icon

    private static Icon LoadTrayIcon()
    {
        try
        {
            var iconPath = Path.Combine(AppContext.BaseDirectory, "MAN_icon.ico");
            if (File.Exists(iconPath))
                return new Icon(iconPath);
        }
        catch
        {
            // Fallback to generated icon below.
        }

        return CreateFallbackTrayIcon();
    }

    private static Icon CreateColoredTrayIcon(Color accent)
    {
        var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            using var bgBrush = new SolidBrush(accent);
            g.FillEllipse(bgBrush, 1, 1, 30, 30);

            using var font = new Font("Segoe UI", 15, FontStyle.Bold);
            using var sf = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center
            };
            g.DrawString("N", font, Brushes.White, new RectangleF(0, -1, 32, 32), sf);
        }

        var hIcon = bmp.GetHicon();
        var icon = (Icon)Icon.FromHandle(hIcon).Clone();
        DestroyIcon(hIcon);
        return icon;
    }

    private static Icon CreateFallbackTrayIcon()
    {
        var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            // Blue circle background
            using var bgBrush = new SolidBrush(Color.FromArgb(0, 120, 215));
            g.FillEllipse(bgBrush, 1, 1, 30, 30);

            // White "N" letter
            using var font = new Font("Segoe UI", 15, FontStyle.Bold);
            using var sf = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center
            };
            g.DrawString("N", font, Brushes.White, new RectangleF(0, -1, 32, 32), sf);
        }

        var hIcon = bmp.GetHicon();
        var icon = (Icon)Icon.FromHandle(hIcon).Clone();
        DestroyIcon(hIcon);
        return icon;
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);

    #endregion

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _host.StatusUpdated -= OnDiscoverySnapshotUpdated;

            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _iconGreen?.Dispose();
            _iconYellow?.Dispose();
            _iconRed?.Dispose();
            _fileLogger.Dispose();
        }
        base.Dispose(disposing);
    }
}

/// <summary>
/// Dark-themed color table for the context menu
/// </summary>
internal class DarkColorTable : ProfessionalColorTable
{
    public override Color MenuBorder => Color.FromArgb(60, 60, 60);
    public override Color MenuItemSelected => Color.FromArgb(55, 55, 55);
    public override Color MenuItemSelectedGradientBegin => Color.FromArgb(55, 55, 55);
    public override Color MenuItemSelectedGradientEnd => Color.FromArgb(55, 55, 55);
    public override Color MenuStripGradientBegin => Color.FromArgb(35, 35, 35);
    public override Color MenuStripGradientEnd => Color.FromArgb(35, 35, 35);
    public override Color MenuItemBorder => Color.FromArgb(80, 80, 80);
    public override Color ToolStripDropDownBackground => Color.FromArgb(40, 40, 40);
    public override Color ImageMarginGradientBegin => Color.FromArgb(40, 40, 40);
    public override Color ImageMarginGradientMiddle => Color.FromArgb(40, 40, 40);
    public override Color ImageMarginGradientEnd => Color.FromArgb(40, 40, 40);
    public override Color SeparatorDark => Color.FromArgb(60, 60, 60);
    public override Color SeparatorLight => Color.FromArgb(60, 60, 60);
}
