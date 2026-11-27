using System.Reflection;
using Avalonia;
using NDIManager.Hosting;

namespace NDIManager.Linux;

internal static class Program
{
    private const string Usage = """
        NDI Manager for Linux

        Usage:
          ndi-manager                 Tray icon + web server (desktop session).
                                      If the service already serves the port, only the tray icon runs.
          ndi-manager --service       Headless web server (systemd). Also used when there is no display.
          ndi-manager --port <n>      Use port <n> (default: settings.json, then 5000).
          ndi-manager --version | --help

        Environment:
          NDIMANAGER_DATA_DIR   settings + logs folder (default ~/.local/share/NDIManager)
          NDI_RUNTIME_DIR_V6    folder containing libndi.so.6 (default: system library path)
        """;

    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Contains("--help") || args.Contains("-h"))
        {
            Console.WriteLine(Usage);
            return 0;
        }

        if (args.Contains("--version"))
        {
            Console.WriteLine($"ndi-manager {AppVersion}");
            return 0;
        }

        if (args.Contains("--check-ndi"))
            return CheckNdi();

        var options = LaunchOptions.Parse(args);
        var hasDisplay = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DISPLAY"))
            || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WAYLAND_DISPLAY"));

        if (options.Service || !hasDisplay)
        {
            if (!options.Service)
                Console.WriteLine("No graphical session found: running as a headless server (use --service to silence this).");
            return ServiceMode.RunAsync(options).GetAwaiter().GetResult();
        }

        // One tray per user session.
        using var mutex = new Mutex(true, $"NDIManager-Tray-{Environment.UserName}", out var createdNew);
        if (!createdNew)
        {
            Console.WriteLine("NDI Manager is already running in this session (see the tray icon).");
            return 0;
        }

        TrayApp.Options = options;
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args, Avalonia.Controls.ShutdownMode.OnExplicitShutdown);
        return 0;
    }

    /// <summary>Reports whether the NDI runtime can be loaded and its version (exit code 0 = OK).</summary>
    private static int CheckNdi()
    {
        NdiLibraryResolver.Register();
        try
        {
            var version = System.Runtime.InteropServices.Marshal.PtrToStringUTF8(NDI.NDIlib_version()) ?? "?";
            Console.WriteLine($"NDI runtime: {version}");
            Console.WriteLine($"Loaded from: {NdiLibraryResolver.LoadedFrom}");
            return 0;
        }
        catch (DllNotFoundException)
        {
            Console.WriteLine("NDI runtime not found. Looked for libndi.so.6 in:");
            foreach (var c in NdiLibraryResolver.LinuxCandidates())
                Console.WriteLine($"  {c}");
            Console.WriteLine($"Install the NDI 6 SDK for Linux or set {NdiLibraryResolver.RuntimeDirEnvVar}.");
            return 1;
        }
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<TrayApp>().UsePlatformDetect().LogToTrace();

    public static string AppVersion =>
        typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            .Split('+')[0]
        ?? "3.3.0";
}

/// <summary>Command-line options shared by the tray and the service.</summary>
internal sealed record LaunchOptions(bool Service, int Port, string[] HostArgs)
{
    public static LaunchOptions Parse(string[] args)
    {
        var service = args.Contains("--service") || args.Contains("--headless");
        int? port = null;
        var hostArgs = new List<string>();
        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            if (a is "--service" or "--headless")
                continue;
            if (a == "--port" && i + 1 < args.Length && int.TryParse(args[i + 1], out var p) && p is > 0 and <= 65535)
            {
                port = p;
                i++;
                continue;
            }
            hostArgs.Add(a);
        }

        if (port is null && int.TryParse(Environment.GetEnvironmentVariable("NDIMANAGER_PORT"), out var envPort)
            && envPort is > 0 and <= 65535)
            port = envPort;

        return new LaunchOptions(service, port ?? ManagerSettings.LoadPort(), hostArgs.ToArray());
    }
}
