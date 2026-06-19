using System.Runtime.InteropServices;

namespace NDIManager;

public static class NDI
{
    private const string DLL_NAME = "Processing.NDI.Lib.x64.dll";

    #region Enums

    public enum FourCC_video_type : uint
    {
        BGRA = 0x41524742,
        RGBA = 0x41424752,
        BGRX = 0x58524742,
        RGBX = 0x58424752,
        UYVY = 0x59565955,
        UYVA = 0x41565955
    }

    public enum FourCC_audio_type : uint
    {
        FLTP = 0x70544C46
    }

    public enum frame_format_type
    {
        Progressive = 1,
        Interleaved = 0,
        Field0 = 2,
        Field1 = 3
    }

    public enum recv_color_format
    {
        BGRX_BGRA = 0,
        UYVY_BGRA = 1,
        RGBX_RGBA = 2,
        UYVY_RGBA = 3,
        Fastest = 100
    }

    public enum recv_bandwidth
    {
        metadata_only = -10,
        audio_only = 10,
        lowest = 0,
        highest = 100
    }

    public enum frame_type
    {
        None = 0,
        Video = 1,
        Audio = 2,
        Metadata = 3,
        Error = 4,
        StatusChange = 100,
        SourceChange = 101
    }

    public enum receiver_type : uint
    {
        None = 0,
        Metadata = 1,
        Video = 2,
        Audio = 3
    }

    public enum receiver_command : uint
    {
        None = 0,
        Connect = 1
    }

    #endregion

    #region Structures

    [StructLayout(LayoutKind.Sequential)]
    public struct send_create_t
    {
        public IntPtr p_ndi_name;  // UTF-8 string
        public IntPtr p_groups;    // UTF-8 string
        [MarshalAs(UnmanagedType.U1)]
        public bool clock_video;
        [MarshalAs(UnmanagedType.U1)]
        public bool clock_audio;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct find_create_t
    {
        [MarshalAs(UnmanagedType.U1)]
        public bool show_local_sources;
        public IntPtr p_groups;
        public IntPtr p_extra_ips;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct source_t
    {
        public IntPtr p_ndi_name;
        public IntPtr p_url_address;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct video_frame_v2_t
    {
        public int xres;
        public int yres;
        public FourCC_video_type FourCC;
        public int frame_rate_N;
        public int frame_rate_D;
        public float picture_aspect_ratio;
        public frame_format_type frame_format_type;
        public long timecode;
        public IntPtr p_data;
        public int line_stride_in_bytes;
        public IntPtr p_metadata;
        public long timestamp;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct audio_frame_v3_t
    {
        public int sample_rate;
        public int no_channels;
        public int no_samples;
        public long timecode;
        public FourCC_audio_type FourCC;
        public IntPtr p_data;
        public int channel_stride_in_bytes;
        public IntPtr p_metadata;
        public long timestamp;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct metadata_frame_t
    {
        public int length;
        public long timecode;
        public IntPtr p_data;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct recv_performance_t
    {
        public long video_frames;
        public long audio_frames;
        public long metadata_frames;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct recv_queue_t
    {
        public int video_frames;
        public int audio_frames;
        public int metadata_frames;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct send_advertiser_create_t
    {
        public IntPtr p_url_address;  // UTF-8 string - Discovery Server URL
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct recv_advertiser_create_t
    {
        public IntPtr p_url_address;  // UTF-8 string - Discovery Server URL
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct send_listener_create_t
    {
        public IntPtr p_url_address;  // UTF-8 string - Discovery Server URL
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct sender_t
    {
        public IntPtr p_uuid;        // Unique identifier
        public IntPtr p_name;        // Human-readable name
        public IntPtr p_metadata;    // Source metadata
        public IntPtr p_address;     // IP address
        public int port;             // Port number
        public IntPtr p_groups;      // Array of group strings
        public uint num_groups;      // Number of groups
        [MarshalAs(UnmanagedType.U1)]
        public bool events_subscribed;  // Events subscription status
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct recv_listener_create_t
    {
        public IntPtr p_url_address;  // UTF-8 string - Discovery Server URL
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct receiver_t
    {
        public IntPtr p_uuid;        // Unique identifier
        public IntPtr p_name;        // Human-readable name
        public IntPtr p_input_uuid;  // Input source UUID
        public IntPtr p_input_name;  // Input source name
        public IntPtr p_address;     // IP address
        public IntPtr p_streams;     // Array of stream types
        public uint num_streams;     // Number of streams
        public IntPtr p_commands;    // Array of supported commands
        public uint num_commands;    // Number of commands
        [MarshalAs(UnmanagedType.U1)]
        public bool events_subscribed;  // Events subscription status
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct recv_create_v3_t
    {
        public source_t source_to_connect_to;
        public recv_color_format color_format;
        public recv_bandwidth bandwidth;
        [MarshalAs(UnmanagedType.U1)]
        public bool allow_video_fields;
        public IntPtr p_ndi_recv_name;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct listener_event
    {
        public IntPtr p_uuid;   // UUID of receiver/sender that triggered event
        public IntPtr p_name;   // Name of the event
        public IntPtr p_value;  // Value of the event
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct tally_t
    {
        [MarshalAs(UnmanagedType.U1)]
        public bool on_program;  // Tally is on program output (red)
        [MarshalAs(UnmanagedType.U1)]
        public bool on_preview;  // Tally is on preview output (green)
    }

    #endregion

    #region Constants

    public const long send_timecode_synthesize = long.MaxValue;

    #endregion

    #region DLL Imports

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_initialize();

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_destroy();

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_send_create(ref send_create_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_send_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_send_send_video_v2(IntPtr p_instance, ref video_frame_v2_t p_video_data);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_send_send_audio_v3(IntPtr p_instance, ref audio_frame_v3_t p_audio_data);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern int NDIlib_send_get_no_connections(IntPtr p_instance, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_send_get_tally(IntPtr p_instance, ref tally_t p_tally, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_find_create_v2(ref find_create_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_find_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_find_wait_for_sources(IntPtr p_instance, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_find_get_current_sources(IntPtr p_instance, ref uint p_no_sources);

    // Receiver API
    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_recv_create_v3(ref recv_create_v3_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_connect(IntPtr p_instance, ref source_t p_source);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_set_tally(IntPtr p_instance, ref tally_t p_tally);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_get_performance(IntPtr p_instance, ref recv_performance_t p_total, ref recv_performance_t p_dropped);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_get_queue(IntPtr p_instance, ref recv_queue_t p_total);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_recv_get_web_control(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_free_string(IntPtr p_instance, IntPtr p_string);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_send_metadata(IntPtr p_instance, ref metadata_frame_t p_metadata);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern int NDIlib_recv_get_no_connections(IntPtr p_instance);

    // SendAdvertiser API - NDI 6
    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_send_advertiser_create(ref send_advertiser_create_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_send_advertiser_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_send_advertiser_add_sender(IntPtr p_instance, IntPtr p_sender, bool allow_monitoring);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_send_advertiser_del_sender(IntPtr p_instance, IntPtr p_sender);

    // SendListener API - NDI 6
    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_send_listener_create(ref send_listener_create_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_send_listener_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_send_listener_is_connected(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern IntPtr NDIlib_send_listener_get_server_url(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_send_listener_get_senders(IntPtr p_instance, ref uint p_num_senders);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_send_listener_wait_for_senders(IntPtr p_instance, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern void NDIlib_send_listener_subscribe_events(IntPtr p_instance, string p_sender_uuid);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern void NDIlib_send_listener_unsubscribe_events(IntPtr p_instance, string p_sender_uuid);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_send_listener_get_events(IntPtr p_instance, ref uint p_num_events, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_send_listener_free_events(IntPtr p_instance, IntPtr p_events);

    // RecvListener API - NDI 6
    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_recv_listener_create(ref recv_listener_create_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_listener_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_listener_is_connected(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern IntPtr NDIlib_recv_listener_get_server_url(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_recv_listener_get_receivers(IntPtr p_instance, ref uint p_num_receivers);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_listener_wait_for_receivers(IntPtr p_instance, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_listener_send_connect(IntPtr p_instance, string p_receiver_uuid, string p_source_name);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern void NDIlib_recv_listener_subscribe_events(IntPtr p_instance, string p_receiver_uuid);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern void NDIlib_recv_listener_unsubscribe_events(IntPtr p_instance, string p_receiver_uuid);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_recv_listener_get_events(IntPtr p_instance, ref uint p_num_events, uint timeout_in_ms);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_listener_free_events(IntPtr p_instance, IntPtr p_events);

    // RecvAdvertiser API - NDI 6
    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr NDIlib_recv_advertiser_create(ref recv_advertiser_create_t p_create_settings);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    public static extern void NDIlib_recv_advertiser_destroy(IntPtr p_instance);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_advertiser_add_receiver(
        IntPtr p_instance, IntPtr p_receiver,
        [MarshalAs(UnmanagedType.U1)] bool allow_controlling,
        [MarshalAs(UnmanagedType.U1)] bool allow_monitoring,
        IntPtr p_input_group_name);

    [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool NDIlib_recv_advertiser_del_receiver(IntPtr p_instance, IntPtr p_receiver);

    #endregion
}
