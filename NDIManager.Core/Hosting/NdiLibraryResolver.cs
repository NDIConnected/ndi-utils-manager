using System.Reflection;
using System.Runtime.InteropServices;

namespace NDIManager.Hosting;

/// <summary>
/// Maps the NDI wrapper's library name (<c>Processing.NDI.Lib.x64.dll</c>) to the right file per OS.
/// Windows keeps the default lookup (DLL next to the exe). Linux looks for <c>libndi.so.6</c> in:
/// the app folder, <c>$NDI_RUNTIME_DIR_V6</c>, then the system library path (/usr/lib, /usr/local/lib, ldconfig).
/// </summary>
public static class NdiLibraryResolver
{
    public const string RuntimeDirEnvVar = "NDI_RUNTIME_DIR_V6";

    private static readonly string[] LinuxNames = ["libndi.so.6", "libndi.so"];
    private static readonly string[] LinuxSystemDirs =
        ["/usr/lib", "/usr/local/lib", "/usr/lib/x86_64-linux-gnu", "/opt/ndi/lib", "/usr/local/lib/ndi"];

    /// <summary>Path or name of the NDI library actually loaded (for logs / status), once resolved.</summary>
    public static string? LoadedFrom { get; private set; }

    private static int _registered;

    /// <summary>Installs the resolver (idempotent). Must run before the first NDI call.</summary>
    public static void Register()
    {
        if (Interlocked.Exchange(ref _registered, 1) == 0)
            NativeLibrary.SetDllImportResolver(typeof(NDI).Assembly, Resolve);
    }

    private static IntPtr Resolve(string libraryName, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (!libraryName.StartsWith("Processing.NDI.Lib", StringComparison.OrdinalIgnoreCase))
            return IntPtr.Zero;

        if (!OperatingSystem.IsLinux())
        {
            if (NativeLibrary.TryLoad(libraryName, assembly, searchPath, out var handle))
            {
                LoadedFrom = libraryName;
                return handle;
            }
            return IntPtr.Zero;
        }

        foreach (var candidate in LinuxCandidates())
        {
            if (NativeLibrary.TryLoad(candidate, out var handle))
            {
                LoadedFrom = candidate;
                return handle;
            }
        }
        return IntPtr.Zero; // DllNotFoundException with the original name → logged by the discovery service
    }

    /// <summary>Linux candidates in lookup order (absolute paths first, then bare names for the loader).</summary>
    public static IEnumerable<string> LinuxCandidates()
    {
        var dirs = new List<string> { AppContext.BaseDirectory };
        var runtimeDir = Environment.GetEnvironmentVariable(RuntimeDirEnvVar);
        if (!string.IsNullOrWhiteSpace(runtimeDir))
            dirs.Add(runtimeDir);
        dirs.AddRange(LinuxSystemDirs);

        foreach (var dir in dirs)
            foreach (var name in LinuxNames)
            {
                var path = Path.Combine(dir, name);
                if (File.Exists(path))
                    yield return path;
            }

        foreach (var name in LinuxNames)
            yield return name; // let dlopen search LD_LIBRARY_PATH / ld.so.cache
    }
}
