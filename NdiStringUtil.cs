using System.Runtime.InteropServices;
using System.Text;

namespace NDIManager;

/// <summary>
/// NDI discovery / listener APIs use UTF-8 C strings. Marshal as UTF-8, not ANSI.
/// </summary>
internal static class NdiStringUtil
{
    public static string PtrToUtf8String(IntPtr ptr)
    {
        if (ptr == IntPtr.Zero)
            return string.Empty;

        int len = 0;
        while (Marshal.ReadByte(ptr, len) != 0)
            len++;

        if (len == 0)
            return string.Empty;

        var buf = new byte[len];
        Marshal.Copy(ptr, buf, 0, len);
        return Encoding.UTF8.GetString(buf);
    }

    /// <summary>Allocates a null-terminated UTF-8 copy; caller must <see cref="Marshal.FreeHGlobal"/>.</summary>
    public static IntPtr AllocUtf8NullTerminated(string s)
    {
        var trimmed = s.Trim();
        var bytes = Encoding.UTF8.GetBytes(trimmed + "\0");
        var p = Marshal.AllocHGlobal(bytes.Length);
        Marshal.Copy(bytes, 0, p, bytes.Length);
        return p;
    }

    /// <summary>
    /// SDK sender monitoring uses string values "true" / "false" for booleans (see NDI Advanced SDK §18).
    /// </summary>
    public static bool IsNdiTrueString(string? value) =>
        string.Equals(value?.Trim(), "true", StringComparison.OrdinalIgnoreCase);
}
