namespace NDIManager.Hosting;

/// <summary>
/// Where settings and logs live.
/// Windows: <c>%LocalAppData%\NDIManager</c>; Linux desktop: <c>~/.local/share/NDIManager</c>;
/// Linux service: the <c>NDIMANAGER_DATA_DIR</c> environment variable (set by the systemd unit).
/// </summary>
public static class AppPaths
{
    public const string DataDirEnvVar = "NDIMANAGER_DATA_DIR";

    public static string DataDirectory
    {
        get
        {
            var overridden = Environment.GetEnvironmentVariable(DataDirEnvVar);
            if (!string.IsNullOrWhiteSpace(overridden))
                return overridden;
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData,
                    Environment.SpecialFolderOption.DoNotVerify),
                "NDIManager");
        }
    }

    public static string LogsDirectory => Path.Combine(DataDirectory, "logs");

    public static string SettingsPath => Path.Combine(DataDirectory, "settings.json");
}
