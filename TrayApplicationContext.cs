using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Text.Json;
using NDIManager.Hubs;
using NDIManager.Models;
using NDIManager.Services;

namespace NDIManager;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly string[] _args;
    private readonly string _settingsPath;

    private WebApplication? _webApp;
    private CancellationTokenSource? _cts;
    private Task? _runTask;
    private int _currentPort;
    private bool _serverRunning;

    private ToolStripMenuItem? _portMenuItem;
    private ToolStripMenuItem? _statusMenuItem;
    private ToolStripMenuItem? _discoveryMenuItem;

    private NDIDiscoveryService? _discoveryService;
    private Icon? _iconGreen;
    private Icon? _iconYellow;
    private Icon? _iconRed;
    private string _lastHealth = "unknown";
    private readonly SynchronizationContext? _uiContext = SynchronizationContext.Current;

    public TrayApplicationContext(string[] args)
    {
        _args = args;
        _settingsPath = InitSettingsPath();
        _currentPort = LoadPort();

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
            _cts = new CancellationTokenSource();

            // Anchor content root (wwwroot, appsettings.json) to the exe folder, not the current
            // working directory: shortcuts/scripts may start the app from anywhere.
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = _args,
                ContentRootPath = AppContext.BaseDirectory,
            });

            // Services
            builder.Services.AddControllers();
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowReactSPA", policy =>
                {
                    policy.AllowAnyOrigin()
                          .AllowAnyMethod()
                          .AllowAnyHeader();
                });
            });

            builder.Services.AddSignalR();

            builder.Services.AddSingleton<NDIDiscoveryService>();
            builder.Services.AddHostedService<NDIDiscoveryService>(
                sp => sp.GetRequiredService<NDIDiscoveryService>());

            builder.WebHost.UseUrls($"http://localhost:{_currentPort}", $"http://*:{_currentPort}");

            // In WinExe mode, console logging goes nowhere - keep default providers
            // for Debug output window; add file logging if needed later
            builder.Logging.SetMinimumLevel(LogLevel.Warning);
            // Temporary: Send/Recv listener diagnostic logs (§18 monitoring)
            builder.Logging.AddFilter("NDIManager", LogLevel.Information);

            _webApp = builder.Build();

            // Middleware pipeline
            _webApp.UseSwagger();
            _webApp.UseSwaggerUI();
            _webApp.UseCors("AllowReactSPA");
            _webApp.UseDefaultFiles();
            _webApp.UseStaticFiles();
            _webApp.UseWebSockets();
            _webApp.UseAuthorization();
            _webApp.MapControllers();
            _webApp.MapHub<NdiHub>("/hubs/ndi");
            _webApp.MapFallbackToFile("index.html");

            _discoveryService = _webApp.Services.GetRequiredService<NDIDiscoveryService>();
            _discoveryService.SnapshotUpdated += OnDiscoverySnapshotUpdated;

            UpdateStatus(true);

            _trayIcon.ShowBalloonTip(
                2000,
                "NDI Manager",
                $"Running on http://localhost:{_currentPort}",
                ToolTipIcon.Info);

            _runTask = _webApp.RunAsync(_cts.Token);
            await _runTask;
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
        if (_cts != null)
            await _cts.CancelAsync();

        // Wait for the host to finish stopping (discovery loop ended, NDI released, port freed)
        // before disposing or starting a new instance.
        if (_runTask != null)
        {
            try
            {
                await _runTask;
            }
            catch
            {
                // Errors are reported by StartWebServerAsync.
            }
            _runTask = null;
        }

        _cts?.Dispose();
        _cts = null;

        if (_discoveryService != null)
        {
            _discoveryService.SnapshotUpdated -= OnDiscoverySnapshotUpdated;
            _discoveryService = null;
        }

        if (_webApp != null)
        {
            try
            {
                await _webApp.DisposeAsync();
            }
            catch { }
            _webApp = null;
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
        if (_discoveryService == null)
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
            SavePort(_currentPort);

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
        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NDIManager");
        Directory.CreateDirectory(folder);
        return Path.Combine(folder, "settings.json");
    }

    private int LoadPort()
    {
        try
        {
            if (File.Exists(_settingsPath))
            {
                var json = File.ReadAllText(_settingsPath);
                var settings = JsonSerializer.Deserialize<ManagerSettings>(json);
                if (settings?.Port is > 0 and <= 65535)
                    return settings.Port;
            }
        }
        catch { }

        return 5000;
    }

    private void SavePort(int port)
    {
        try
        {
            var settings = new ManagerSettings { Port = port };
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_settingsPath, json);
        }
        catch { }
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
            if (_discoveryService != null)
                _discoveryService.SnapshotUpdated -= OnDiscoverySnapshotUpdated;

            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _iconGreen?.Dispose();
            _iconYellow?.Dispose();
            _iconRed?.Dispose();
            _cts?.Dispose();
        }
        base.Dispose(disposing);
    }
}

/// <summary>
/// Application settings persisted to disk
/// </summary>
public class ManagerSettings
{
    public int Port { get; set; } = 5000;
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
