using NDIManager.Controllers;
using NDIManager.Hubs;
using NDIManager.Models;
using NDIManager.Services;

namespace NDIManager.Hosting;

/// <summary>
/// The NDI Manager server (web UI, REST + SignalR API, NDI discovery) as one start/stop unit.
/// Used by the Windows tray app, the Linux tray app and the Linux headless service.
/// </summary>
public sealed class NdiManagerHost : IAsyncDisposable
{
    private readonly FileLoggerProvider _fileLogger;
    private readonly bool _consoleLogging;
    private WebApplication? _app;
    private NDIDiscoveryService? _discovery;

    static NdiManagerHost()
    {
        NdiLibraryResolver.Register();
    }

    /// <param name="fileLogger">Shared file logger (outlives restarts of the host).</param>
    /// <param name="consoleLogging">Also log to stdout (headless service → journald).</param>
    public NdiManagerHost(FileLoggerProvider fileLogger, bool consoleLogging = false)
    {
        _fileLogger = fileLogger;
        _consoleLogging = consoleLogging;
    }

    public int Port { get; private set; }

    public bool IsRunning => _app != null;

    /// <summary>Raised from the discovery loop (thread pool) after each published snapshot.</summary>
    public event Action<NdiSystemStatus>? StatusUpdated;

    /// <summary>Builds and starts the server on <paramref name="port"/>. Throws if it cannot start (e.g. port in use).</summary>
    public async Task StartAsync(int port, string[] args, CancellationToken cancellationToken = default)
    {
        if (_app != null)
            throw new InvalidOperationException("The server is already running.");

        // Anchor content root (wwwroot, appsettings.json) to the executable folder, not the current
        // working directory: shortcuts, scripts and systemd may start the app from anywhere.
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
        });

        builder.Services.AddControllers().AddApplicationPart(typeof(NDIController).Assembly);
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowReactSPA", policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
        });
        builder.Services.AddSignalR();
        builder.Services.AddSingleton<NDIDiscoveryService>();
        builder.Services.AddHostedService(sp => sp.GetRequiredService<NDIDiscoveryService>());

        builder.WebHost.UseUrls($"http://localhost:{port}", $"http://*:{port}");

        builder.Logging.ClearProviders();
        builder.Logging.SetMinimumLevel(LogLevel.Warning);
        builder.Logging.AddFilter("NDIManager", LogLevel.Information);
        builder.Logging.AddProvider(_fileLogger);
        if (_consoleLogging)
            builder.Logging.AddSimpleConsole(o => { o.SingleLine = true; o.TimestampFormat = "HH:mm:ss "; });

        var app = builder.Build();
        app.UseSwagger();
        app.UseSwaggerUI();
        app.UseCors("AllowReactSPA");
        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.UseWebSockets();
        app.UseAuthorization();
        app.MapControllers();
        app.MapHub<NdiHub>("/hubs/ndi");
        app.MapFallbackToFile("index.html");

        var discovery = app.Services.GetRequiredService<NDIDiscoveryService>();
        discovery.SnapshotUpdated += OnSnapshotUpdated;

        try
        {
            await app.StartAsync(cancellationToken);
        }
        catch
        {
            discovery.SnapshotUpdated -= OnSnapshotUpdated;
            await app.DisposeAsync();
            throw;
        }

        _app = app;
        _discovery = discovery;
        Port = port;
    }

    /// <summary>Completes when the host is asked to stop (SIGTERM / Ctrl+C in a console, or <see cref="StopAsync"/>).</summary>
    public Task WaitForShutdownAsync(CancellationToken cancellationToken = default) =>
        _app?.WaitForShutdownAsync(cancellationToken) ?? Task.CompletedTask;

    /// <summary>Stops the server and waits for the discovery loop to end and NDI handles to be released.</summary>
    public async Task StopAsync()
    {
        var app = _app;
        if (app == null)
            return;
        _app = null;

        if (_discovery != null)
        {
            _discovery.SnapshotUpdated -= OnSnapshotUpdated;
            _discovery = null;
        }

        try
        {
            await app.StopAsync();
        }
        finally
        {
            await app.DisposeAsync();
        }
    }

    private void OnSnapshotUpdated(NdiSystemStatus status)
    {
        try
        {
            StatusUpdated?.Invoke(status);
        }
        catch
        {
            // UI update errors must never break the discovery loop.
        }
    }

    public async ValueTask DisposeAsync() => await StopAsync();
}
