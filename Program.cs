using NDIManager;

namespace NDIManager;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        // Single instance check
        using var mutex = new Mutex(true, "Global\\NDIManager-SingleInstance", out bool createdNew);
        if (!createdNew)
        {
            MessageBox.Show(
                "NDI Manager is already running.\nCheck the system tray icon.",
                "NDI Manager",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.SystemAware);

        using var context = new TrayApplicationContext(args);
        Application.Run(context);
    }
}
