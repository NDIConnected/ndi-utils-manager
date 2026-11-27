using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;

namespace NDIManager.Linux;

/// <summary>Small window to pick the web port (same range as the Windows dialog).</summary>
internal static class PortDialog
{
    public static Task<int?> ShowAsync(int currentPort)
    {
        var tcs = new TaskCompletionSource<int?>();

        var input = new NumericUpDown
        {
            Minimum = 1024,
            Maximum = 65535,
            Increment = 1,
            Value = currentPort,
            FormatString = "0",
            Width = 160,
        };
        var ok = new Button { Content = "OK", IsDefault = true, Width = 80 };
        var cancel = new Button { Content = "Cancel", IsCancel = true, Width = 80 };

        var window = new Window
        {
            Title = "NDI Manager — Web port",
            SizeToContent = SizeToContent.WidthAndHeight,
            CanResize = false,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            Content = new StackPanel
            {
                Margin = new Thickness(20),
                Spacing = 12,
                Children =
                {
                    new TextBlock { Text = "Web UI port (the server restarts on the new port):" },
                    input,
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        HorizontalAlignment = HorizontalAlignment.Right,
                        Spacing = 8,
                        Children = { cancel, ok },
                    },
                },
            },
        };

        ok.Click += (_, _) =>
        {
            tcs.TrySetResult(input.Value is { } v ? (int)v : null);
            window.Close();
        };
        cancel.Click += (_, _) => window.Close();
        window.Closed += (_, _) => tcs.TrySetResult(null);
        window.Show();
        window.Activate();
        return tcs.Task;
    }
}
