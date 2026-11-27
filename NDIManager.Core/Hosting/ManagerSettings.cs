using System.Text.Json;

namespace NDIManager.Hosting;

/// <summary>Application settings persisted to <see cref="AppPaths.SettingsPath"/>.</summary>
public class ManagerSettings
{
    public const int DefaultPort = 5000;

    public int Port { get; set; } = DefaultPort;

    /// <summary>Reads the configured web port; falls back to <see cref="DefaultPort"/> on any problem.</summary>
    public static int LoadPort(string? path = null)
    {
        try
        {
            path ??= AppPaths.SettingsPath;
            if (File.Exists(path))
            {
                var settings = JsonSerializer.Deserialize<ManagerSettings>(File.ReadAllText(path));
                if (settings?.Port is > 0 and <= 65535)
                    return settings.Port;
            }
        }
        catch
        {
            // Unreadable settings: use the default port.
        }
        return DefaultPort;
    }

    /// <summary>Saves the web port; returns false when the settings file cannot be written.</summary>
    public static bool SavePort(int port, string? path = null)
    {
        try
        {
            path ??= AppPaths.SettingsPath;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var json = JsonSerializer.Serialize(new ManagerSettings { Port = port },
                new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
