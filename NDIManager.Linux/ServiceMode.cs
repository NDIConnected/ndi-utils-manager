using NDIManager.Hosting;
using NDIManager.Services;

namespace NDIManager.Linux;

/// <summary>Headless server for systemd: logs to stdout (journald) and to the data folder, stops on SIGTERM.</summary>
internal static class ServiceMode
{
    public static async Task<int> RunAsync(LaunchOptions options)
    {
        Directory.CreateDirectory(AppPaths.DataDirectory);
        using var fileLogger = new FileLoggerProvider(AppPaths.LogsDirectory);
        await using var host = new NdiManagerHost(fileLogger, consoleLogging: true);

        try
        {
            await host.StartAsync(options.Port, options.HostArgs);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"NDI Manager could not start on port {options.Port}: {ex.Message}");
            return 1;
        }

        Console.WriteLine($"NDI Manager {Program.AppVersion} running on http://0.0.0.0:{options.Port} (data: {AppPaths.DataDirectory})");

        // The web host's console lifetime turns SIGTERM / Ctrl+C into a graceful shutdown.
        await host.WaitForShutdownAsync();
        await host.StopAsync();
        return 0;
    }
}
