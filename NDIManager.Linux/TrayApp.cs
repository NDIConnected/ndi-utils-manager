using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform;
using Avalonia.Styling;
using Avalonia.Themes.Fluent;
using Avalonia.Threading;
using NDIManager.Hosting;
using NDIManager.Models;
using NDIManager.Services;

namespace NDIManager.Linux;

/// <summary>
/// Tray icon for desktop sessions (StatusNotifierItem: KDE, XFCE, Cinnamon, MATE; GNOME needs the
/// AppIndicator extension, preinstalled on Ubuntu).
/// Runs the web server in-process, or — when another process (the systemd service) already serves the
/// configured port — acts as a client that only shows its status and opens the Web UI.
/// </summary>
public sealed class TrayApp : Application
{
    internal static LaunchOptions Options { get; set; } = new(false, ManagerSettings.DefaultPort, []);

    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private FileLoggerProvider? _fileLogger;
    private NdiManagerHost? _host;
    private TrayIcon? _tray;
    private NativeMenuItem? _statusItem;
    private NativeMenuItem? _discoveryItem;
    private NativeMenuItem? _portItem;
    private NativeMenuItem? _restartItem;
    private DispatcherTimer? _clientPoll;
    private int _port;
    private bool _clientMode;
    private bool _serverRunning;
    private string _iconState = "";

    public override void Initialize()
    {
        Styles.Add(new FluentTheme());
        RequestedThemeVariant = ThemeVariant.Dark;
    }

    public override void OnFrameworkInitializationCompleted()
    {
        _port = Options.Port;
        BuildTray();
        _ = StartAsync();
        base.OnFrameworkInitializationCompleted();
    }

    // ---- tray -----------------------------------------------------------------------------------

    private void BuildTray()
    {
        var open = new NativeMenuItem("Open Web UI");
        open.Click += (_, _) => OpenWebUi();

        _statusItem = new NativeMenuItem("Status: starting…") { IsEnabled = false };
        _discoveryItem = new NativeMenuItem("Discovery Server: —") { IsEnabled = false };

        _portItem = new NativeMenuItem($"Port: {_port}…");
        _portItem.Click += async (_, _) => await ChangePortAsync();

        _restartItem = new NativeMenuItem("Restart server");
        _restartItem.Click += async (_, _) => await RestartAsync();

        var data = new NativeMenuItem("Open data folder");
        data.Click += (_, _) => OpenPath(AppPaths.DataDirectory);

        var exit = new NativeMenuItem("Exit");
        exit.Click += async (_, _) => await ExitAsync();

        var menu = new NativeMenu();
        menu.Items.Add(open);
        menu.Items.Add(new NativeMenuItemSeparator());
        menu.Items.Add(_statusItem);
        menu.Items.Add(_discoveryItem);
        menu.Items.Add(_portItem);
        menu.Items.Add(_restartItem);
        menu.Items.Add(data);
        menu.Items.Add(new NativeMenuItemSeparator());
        menu.Items.Add(exit);

        _tray = new TrayIcon
        {
            Icon = LoadIcon("ndi-tray"),
            ToolTipText = "NDI Manager — starting",
            Menu = menu,
            IsVisible = true,
        };
        _tray.Clicked += (_, _) => OpenWebUi();
        TrayIcon.SetIcons(this, [_tray]);
    }

    private static WindowIcon LoadIcon(string name)
    {
        using var stream = AssetLoader.Open(new Uri($"avares://ndi-manager/Assets/{name}.png"));
        return new WindowIcon(stream);
    }

    private void SetIcon(string state)
    {
        if (_tray == null || state == _iconState)
            return;
        _iconState = state;
        _tray.Icon = LoadIcon(state);
    }

    // ---- server / client --------------------------------------------------------------------------

    private async Task StartAsync()
    {
        // Another NDI Manager (typically the systemd service) already answers on this port → client mode.
        if (await ProbeServerAsync())
        {
            EnterClientMode();
            return;
        }

        _clientMode = false;
        _fileLogger ??= new FileLoggerProvider(AppPaths.LogsDirectory);
        _host ??= CreateHost();
        try
        {
            Directory.CreateDirectory(AppPaths.DataDirectory);
            await _host.StartAsync(_port, Options.HostArgs);
            _serverRunning = true;
            OnUi(() =>
            {
                SetMenuForMode();
                _statusItem!.Header = "Status: running";
                _tray!.ToolTipText = $"NDI Manager — http://localhost:{_port}";
                SetIcon("ndi-tray");
            });
        }
        catch (Exception ex)
        {
            _serverRunning = false;
            OnUi(() =>
            {
                SetMenuForMode();
                _statusItem!.Header = $"Status: failed on port {_port} ({ex.Message})";
                _tray!.ToolTipText = "NDI Manager — stopped";
                SetIcon("ndi-tray-error");
            });
        }
    }

    private NdiManagerHost CreateHost()
    {
        var host = new NdiManagerHost(_fileLogger!);
        host.StatusUpdated += status => OnUi(() => ShowStatus(status));
        return host;
    }

    private void EnterClientMode()
    {
        _clientMode = true;
        _serverRunning = true;
        OnUi(() =>
        {
            SetMenuForMode();
            _tray!.ToolTipText = $"NDI Manager (service) — http://localhost:{_port}";
            _clientPoll ??= new DispatcherTimer(TimeSpan.FromSeconds(3), DispatcherPriority.Background,
                async (_, _) => await PollServerStatusAsync());
            _clientPoll.Start();
        });
        _ = PollServerStatusAsync();
    }

    private void SetMenuForMode()
    {
        // The service owns its port and lifecycle (systemctl); the tray only changes its own server.
        _portItem!.IsEnabled = !_clientMode;
        _restartItem!.IsEnabled = !_clientMode;
        _portItem.Header = _clientMode ? $"Port: {_port} (service)" : $"Port: {_port}…";
    }

    private async Task<bool> ProbeServerAsync()
    {
        try
        {
            using var response = await _http.GetAsync($"http://127.0.0.1:{_port}/api/ndi/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task PollServerStatusAsync()
    {
        try
        {
            var status = await _http.GetFromJsonAsync<NdiSystemStatus>(
                $"http://127.0.0.1:{_port}/api/ndi/status", WebJson);
            if (status != null)
                OnUi(() => ShowStatus(status));
        }
        catch
        {
            OnUi(() =>
            {
                _statusItem!.Header = "Status: service not reachable";
                _tray!.ToolTipText = "NDI Manager — service not reachable";
                SetIcon("ndi-tray-error");
            });
        }
    }

    private void ShowStatus(NdiSystemStatus status)
    {
        _statusItem!.Header = status.Health switch
        {
            "ok" => $"Status: OK · {status.SenderCount} snd · {status.ReceiverCount} rcv",
            "idle" => $"Status: waiting for NDI · {status.SenderCount} snd · {status.ReceiverCount} rcv",
            "degraded" => "Status: partial listener",
            "stalled" => "Status: discovery stalled",
            "error" => "Status: listener error",
            _ => "Status: unknown",
        };
        var send = status.SendListenerConnected ? "send OK" : "send OFF";
        var recv = status.RecvListenerConnected ? "recv OK" : "recv OFF";
        _discoveryItem!.Header = $"Discovery: {send} · {recv} · {status.DiscoveryServerUrl}";

        SetIcon(status.Health switch
        {
            "ok" => "ndi-tray-ok",
            "idle" or "degraded" => "ndi-tray-warn",
            "stalled" or "error" => "ndi-tray-error",
            _ => "ndi-tray",
        });
        _tray!.ToolTipText = $"NDI Manager{(_clientMode ? " (service)" : "")} — http://localhost:{_port} ({status.Health})";
    }

    private async Task RestartAsync()
    {
        if (_clientMode || _host == null)
            return;
        OnUi(() => _statusItem!.Header = "Status: restarting…");
        await StopServerAsync();
        await StartAsync();
    }

    private async Task StopServerAsync()
    {
        _serverRunning = false;
        if (_host != null)
        {
            try
            {
                await _host.StopAsync();
            }
            catch
            {
                // Not actionable from the tray.
            }
        }
    }

    private async Task ChangePortAsync()
    {
        if (_clientMode)
            return;
        var newPort = await PortDialog.ShowAsync(_port);
        if (newPort is null || newPort == _port)
            return;
        _port = newPort.Value;
        ManagerSettings.SavePort(_port);
        await RestartAsync();
    }

    private async Task ExitAsync()
    {
        _clientPoll?.Stop();
        if (_tray != null)
            _tray.IsVisible = false;
        await StopServerAsync();
        _fileLogger?.Dispose();
        _http.Dispose();
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
            desktop.Shutdown();
    }

    // ---- helpers ----------------------------------------------------------------------------------

    private void OpenWebUi()
    {
        if (!_serverRunning)
            return;
        OpenPath($"http://localhost:{_port}");
    }

    private static void OpenPath(string target)
    {
        try
        {
            if (!target.StartsWith("http", StringComparison.Ordinal))
                Directory.CreateDirectory(target);
            Process.Start(new ProcessStartInfo("xdg-open", target) { UseShellExecute = false })?.Dispose();
        }
        catch
        {
            // xdg-utils missing: nothing else to try.
        }
    }

    private static void OnUi(Action action)
    {
        if (Dispatcher.UIThread.CheckAccess())
            action();
        else
            Dispatcher.UIThread.Post(action);
    }
}
