namespace NDIManager;

/// <summary>
/// Simple dialog for changing the Web UI port number
/// </summary>
public class PortChangeDialog : Form
{
    private readonly TextBox _portTextBox;
    private readonly Label _errorLabel;

    public int SelectedPort { get; private set; }

    public PortChangeDialog(int currentPort)
    {
        SelectedPort = currentPort;

        // Form settings
        Text = "NDI Manager - Change Port";
        Size = new Size(380, 210);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(30, 30, 30);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9.5f);

        // Label
        var label = new Label
        {
            Text = "Enter the port number for the Web UI:",
            Location = new Point(24, 24),
            Size = new Size(320, 22),
            ForeColor = Color.FromArgb(220, 220, 220)
        };

        // Port input
        _portTextBox = new TextBox
        {
            Text = currentPort.ToString(),
            Location = new Point(24, 54),
            Size = new Size(316, 30),
            Font = new Font("Segoe UI", 13f),
            BackColor = Color.FromArgb(50, 50, 50),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle,
            MaxLength = 5
        };
        _portTextBox.SelectAll();

        // Error label
        _errorLabel = new Label
        {
            Text = "",
            Location = new Point(24, 90),
            Size = new Size(316, 20),
            ForeColor = Color.FromArgb(255, 100, 100),
            Font = new Font("Segoe UI", 8.5f)
        };

        // OK button
        var okButton = new Button
        {
            Text = "Apply && Restart",
            Location = new Point(130, 120),
            Size = new Size(110, 34),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(0, 120, 215),
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        okButton.FlatAppearance.BorderColor = Color.FromArgb(0, 100, 195);
        okButton.Click += OnOkClick;

        // Cancel button
        var cancelButton = new Button
        {
            Text = "Cancel",
            DialogResult = DialogResult.Cancel,
            Location = new Point(250, 120),
            Size = new Size(90, 34),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(55, 55, 55),
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        cancelButton.FlatAppearance.BorderColor = Color.FromArgb(80, 80, 80);

        Controls.AddRange([label, _portTextBox, _errorLabel, okButton, cancelButton]);

        AcceptButton = okButton;
        CancelButton = cancelButton;
    }

    private void OnOkClick(object? sender, EventArgs e)
    {
        if (!int.TryParse(_portTextBox.Text.Trim(), out int port))
        {
            _errorLabel.Text = "Please enter a valid number.";
            _portTextBox.SelectAll();
            _portTextBox.Focus();
            return;
        }

        if (port < 1024 || port > 65535)
        {
            _errorLabel.Text = "Port must be between 1024 and 65535.";
            _portTextBox.SelectAll();
            _portTextBox.Focus();
            return;
        }

        SelectedPort = port;
        DialogResult = DialogResult.OK;
        Close();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Escape)
        {
            DialogResult = DialogResult.Cancel;
            Close();
        }
        base.OnKeyDown(e);
    }
}
