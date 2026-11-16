using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("Light Orbit")]
[assembly: AssemblyDescription("アニメ美術のためのライティング指示ツール")]
[assembly: AssemblyVersion("0.5.0.0")]
[assembly: AssemblyFileVersion("0.5.0.0")]

internal static class Program
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool SetDllDirectory(string path);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    internal static string AssetRoot;
    internal static string DataRoot;

    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            DataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LightOrbit");
            byte[] payload;
            using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("LightOrbit.payload.zip"))
            using (var memory = new MemoryStream()) { source.CopyTo(memory); payload = memory.ToArray(); }
            string hash;
            using (var sha = System.Security.Cryptography.SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(payload)).Replace("-", "").Substring(0, 16);
            AssetRoot = Path.Combine(DataRoot, "app", hash);
            var completed = Path.Combine(AssetRoot, ".ready");
            if (!File.Exists(completed))
            {
                Directory.CreateDirectory(AssetRoot);
                using (var zip = new ZipArchive(new MemoryStream(payload), ZipArchiveMode.Read))
                    foreach (var entry in zip.Entries)
                    {
                        var path = Path.GetFullPath(Path.Combine(AssetRoot, entry.FullName));
                        if (!path.StartsWith(AssetRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Invalid asset path");
                        if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(path); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(path));
                        using (var input = entry.Open()) using (var output = File.Create(path)) input.CopyTo(output);
                    }
                File.WriteAllText(completed, "0.5.0");
            }
            SetDllDirectory(AssetRoot);
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs e)
            {
                var name = new AssemblyName(e.Name).Name;
                if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms") return null;
                return Assembly.LoadFrom(Path.Combine(AssetRoot, name + ".dll"));
            };
            try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            RunWindow(args);
        }
        catch (Exception error) { MessageBox.Show("Light Orbitを起動できませんでした。\n\n" + error.Message, "Light Orbit", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    private static void RunWindow(string[] args) { Application.Run(new OrbitWindow(args)); }
}

internal sealed partial class OrbitWindow : Form
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);
    private readonly WebView2 browser = new WebView2();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    partial void ConfigureProfile(ref string profile);
    partial void OnBrowserReady();
    private const string Origin = "https://light-orbit.example";

    internal OrbitWindow(string[] args)
    {
        Text = "Light Orbit";
        AutoScaleMode = AutoScaleMode.Dpi;
        AutoScaleDimensions = new SizeF(96F, 96F);
        ClientSize = new Size(640, 520);
        MinimumSize = new Size(600, 500);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(244, 243, 239);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        browser.Dock = DockStyle.Fill;
        browser.DefaultBackgroundColor = BackColor;
        Controls.Add(browser);
        Shown += Initialize;
        FormClosed += delegate { browser.Dispose(); };
    }

    private async void Initialize(object sender, EventArgs e)
    {
        try
        {
            double dpi = GetDpiForWindow(Handle) / 96.0;
            ClientSize = new Size((int)Math.Round(640 * dpi), (int)Math.Round(520 * dpi));
            MinimumSize = SizeFromClientSize(new Size((int)Math.Round(600 * dpi), (int)Math.Round(500 * dpi)));
            var profile = Path.Combine(Program.DataRoot, "profile");
            ConfigureProfile(ref profile);
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.SetVirtualHostNameToFolderMapping("light-orbit.example", Path.Combine(Program.AssetRoot, "web"), CoreWebView2HostResourceAccessKind.DenyCors);
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            browser.CoreWebView2.Settings.IsZoomControlEnabled = false;
            browser.CoreWebView2.NavigationStarting += delegate(object s, CoreWebView2NavigationStartingEventArgs ev)
            {
                Uri uri;
                if (!Uri.TryCreate(ev.Uri, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.Host != "light-orbit.example") ev.Cancel = true;
            };
            browser.CoreWebView2.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs ev) { ev.Handled = true; };
            browser.CoreWebView2.PermissionRequested += delegate(object s, CoreWebView2PermissionRequestedEventArgs ev) { ev.State = CoreWebView2PermissionState.Deny; };
            browser.CoreWebView2.WebMessageReceived += HandleMessage;
            OnBrowserReady();
            browser.CoreWebView2.Navigate(Origin + "/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("Microsoft Edge WebView2 Runtimeが必要です。\nMicrosoft公式サイトからインストールして再度起動してください。\n\nhttps://developer.microsoft.com/microsoft-edge/webview2/", "Light Orbit", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception error) { MessageBox.Show(error.Message, "Light Orbit", MessageBoxButtons.OK, MessageBoxIcon.Error); Close(); }
    }

    private void HandleMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Origin + "/", StringComparison.Ordinal)) return;
        string id = null;
        try
        {
            var request = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
            id = Convert.ToString(request["id"]);
            var type = Convert.ToString(request["type"]);
            var data = Convert.ToString(request["data"]);
            if (data.Length > 12 * 1024 * 1024) throw new InvalidDataException("画像が大きすぎます。");
            if (type == "copy-png")
            {
                CopyPng(Convert.FromBase64String(data));
                Reply(id, true, false, null);
            }
            else if (type == "save-png" || type == "save-settings")
            {
                using (var dialog = new SaveFileDialog())
                {
                    dialog.Title = type == "save-png" ? "ライト指示画像を保存" : "ライトの設定を保存";
                    dialog.Filter = type == "save-png" ? "PNG画像 (*.png)|*.png" : "Light Orbitの設定 (*.json)|*.json";
                    dialog.DefaultExt = type == "save-png" ? "png" : "json";
                    dialog.FileName = Path.GetFileName(Convert.ToString(request["name"]));
                    dialog.AddExtension = true;
                    if (dialog.ShowDialog(this) != DialogResult.OK) { Reply(id, true, true, null); return; }
                    if (type == "save-png") File.WriteAllBytes(dialog.FileName, Convert.FromBase64String(data));
                    else File.WriteAllText(dialog.FileName, data, new System.Text.UTF8Encoding(false));
                    Reply(id, true, false, null);
                }
            }
            else throw new InvalidDataException("未対応の操作です。");
        }
        catch (Exception error) { if (id != null) Reply(id, false, false, error.Message); }
    }
    private void Reply(string id, bool ok, bool cancelled, string error)
    {
        browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { id, ok, cancelled, error }));
    }
    private static void CopyPng(byte[] bytes)
    {
        using (var png = new MemoryStream(bytes))
        using (var image = Image.FromStream(png))
        using (var bitmap = new Bitmap(image.Width, image.Height, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(bitmap)) { g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy; g.DrawImage(image, 0, 0, image.Width, image.Height); }
            var data = new DataObject();
            data.SetData("PNG", false, new MemoryStream(bytes));
            data.SetData(DataFormats.Bitmap, true, bitmap);
            Clipboard.SetDataObject(data, true, 5, 100);
        }
    }
}
