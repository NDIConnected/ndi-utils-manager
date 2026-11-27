using System.Collections.Concurrent;
using System.Text;

namespace NDIManager.Services;

/// <summary>
/// Minimal daily-rolling file logger (no extra dependencies). In WinExe mode the default
/// console/debug providers go nowhere, so this is the only persistent diagnostic trail.
/// Files: <c>&lt;data dir&gt;/logs/ndimanager-yyyyMMdd.log</c> (see <see cref="NDIManager.Hosting.AppPaths"/>), newest <see cref="RetainedFiles"/> kept.
/// </summary>
public sealed class FileLoggerProvider : ILoggerProvider
{
    private const int RetainedFiles = 7;

    private readonly string _directory;
    private readonly object _writeLock = new();
    private readonly ConcurrentDictionary<string, FileLogger> _loggers = new(StringComparer.Ordinal);
    private StreamWriter? _writer;
    private DateTime _currentDay;
    private bool _disposed;

    public FileLoggerProvider(string directory)
    {
        _directory = directory;
    }

    public static string DefaultDirectory => NDIManager.Hosting.AppPaths.LogsDirectory;

    public ILogger CreateLogger(string categoryName) =>
        _loggers.GetOrAdd(categoryName, name => new FileLogger(this, name));

    internal void Write(LogLevel level, string category, string message, Exception? exception)
    {
        var now = DateTime.Now;
        var line = new StringBuilder(160)
            .Append(now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
            .Append(" [").Append(LevelTag(level)).Append("] ")
            .Append(category).Append(": ")
            .Append(message);
        if (exception != null)
            line.AppendLine().Append(exception);

        lock (_writeLock)
        {
            if (_disposed)
                return;
            try
            {
                EnsureWriter(now);
                _writer!.WriteLine(line.ToString());
            }
            catch
            {
                // Logging must never take the app down (disk full, folder locked, ...).
            }
        }
    }

    private void EnsureWriter(DateTime now)
    {
        if (_writer != null && now.Date == _currentDay)
            return;

        _writer?.Dispose();
        Directory.CreateDirectory(_directory);
        _currentDay = now.Date;
        var path = Path.Combine(_directory, $"ndimanager-{now:yyyyMMdd}.log");
        var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
        _writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };
        PruneOldFiles();
    }

    private void PruneOldFiles()
    {
        try
        {
            var old = new DirectoryInfo(_directory)
                .GetFiles("ndimanager-*.log")
                .OrderByDescending(f => f.Name, StringComparer.Ordinal)
                .Skip(RetainedFiles);
            foreach (var file in old)
                file.Delete();
        }
        catch
        {
            // Best effort.
        }
    }

    private static string LevelTag(LogLevel level) => level switch
    {
        LogLevel.Trace => "TRC",
        LogLevel.Debug => "DBG",
        LogLevel.Information => "INF",
        LogLevel.Warning => "WRN",
        LogLevel.Error => "ERR",
        LogLevel.Critical => "CRT",
        _ => "???",
    };

    public void Dispose()
    {
        lock (_writeLock)
        {
            _disposed = true;
            _writer?.Dispose();
            _writer = null;
        }
    }

    private sealed class FileLogger(FileLoggerProvider provider, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
                return;
            provider.Write(logLevel, category, formatter(state, exception), exception);
        }
    }
}
