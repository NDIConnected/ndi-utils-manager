using System.Runtime.InteropServices;

namespace NDIManager;

public static class NDISourceDiscovery
{
    public static List<string> GetActiveNDISources()
    {
        var sources = new List<string>();

        if (!NDI.NDIlib_initialize())
            return sources;

        // Create finder
        var findSettings = new NDI.find_create_t
        {
            show_local_sources = true,
            p_groups = IntPtr.Zero,
            p_extra_ips = IntPtr.Zero
        };

        IntPtr findInstance = NDI.NDIlib_find_create_v2(ref findSettings);
        if (findInstance == IntPtr.Zero)
            return sources;

        try
        {
            // Wait a bit for sources to be discovered
            Thread.Sleep(1000);

            // Get sources
            uint numSources = 0;
            IntPtr sourcesPtr = NDI.NDIlib_find_get_current_sources(findInstance, ref numSources);

            if (sourcesPtr != IntPtr.Zero && numSources > 0)
            {
                int structSize = Marshal.SizeOf<NDI.source_t>();

                for (int i = 0; i < numSources; i++)
                {
                    IntPtr currentPtr = IntPtr.Add(sourcesPtr, i * structSize);
                    var source = Marshal.PtrToStructure<NDI.source_t>(currentPtr);

                    if (source.p_ndi_name != IntPtr.Zero)
                    {
                        string? sourceName = Marshal.PtrToStringAnsi(source.p_ndi_name);
                        if (!string.IsNullOrEmpty(sourceName))
                        {
                            sources.Add(sourceName);
                        }
                    }
                }
            }
        }
        finally
        {
            NDI.NDIlib_find_destroy(findInstance);
        }

        return sources;
    }

    public static List<NDI.source_t> FindSources(int timeoutMs = 5000)
    {
        var sources = new List<NDI.source_t>();

        // Create finder
        var findSettings = new NDI.find_create_t
        {
            show_local_sources = true,
            p_groups = IntPtr.Zero,
            p_extra_ips = IntPtr.Zero
        };

        IntPtr findInstance = NDI.NDIlib_find_create_v2(ref findSettings);
        if (findInstance == IntPtr.Zero)
            return sources;

        try
        {
            // Wait for sources to be discovered
            Thread.Sleep(Math.Min(timeoutMs, 1000));

            // Get sources
            uint numSources = 0;
            IntPtr sourcesPtr = NDI.NDIlib_find_get_current_sources(findInstance, ref numSources);

            if (sourcesPtr != IntPtr.Zero && numSources > 0)
            {
                int structSize = Marshal.SizeOf<NDI.source_t>();

                for (int i = 0; i < numSources; i++)
                {
                    IntPtr currentPtr = IntPtr.Add(sourcesPtr, i * structSize);
                    var source = Marshal.PtrToStructure<NDI.source_t>(currentPtr);
                    sources.Add(source);
                }
            }
        }
        finally
        {
            NDI.NDIlib_find_destroy(findInstance);
        }

        return sources;
    }

    public static string GetAvailableSourceName(string baseName)
    {
        var activeSources = GetActiveNDISources();

        // Check if base name is available
        if (!IsSourceNameTaken(baseName, activeSources))
            return baseName;

        // Find next available number
        int counter = 1;
        string newName;

        do
        {
            newName = $"{baseName} {counter:D3}";
            counter++;
        }
        while (IsSourceNameTaken(newName, activeSources) && counter < 1000);

        return newName;
    }

    private static bool IsSourceNameTaken(string name, List<string> activeSources)
    {
        // Check if any active source contains this name
        // NDI sources are in format "MACHINE_NAME (SOURCE_NAME)"
        foreach (var source in activeSources)
        {
            if (source.Contains($"({name})") || source.EndsWith(name))
                return true;
        }
        return false;
    }
}
